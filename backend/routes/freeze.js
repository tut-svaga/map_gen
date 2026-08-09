const express = require('express');
const db = require('../db');
const { START, END, isDay, serverToday } = require('../config/freeze');
const { badRequest, notFound, parseId, normalizeText } = require('../lib/http');

const router = express.Router();

const MAX_TEXT = 500;
const MAX_NOTE = 1000;

// --- вспомогательное ---------------------------------------------------------

// День, к которому относится действие. Клиент присылает свой — он единственный,
// кто знает часовой пояс пользователя. Без него берём дату сервера.
function resolveDay(value) {
  if (value === undefined || value === null || value === '') {
    return serverToday();
  }
  return isDay(value) ? value : null;
}

function inWindow(day) {
  return day >= START && day <= END;
}

// MySQL отдаёт BOOLEAN как 0/1 — приводим к настоящему boolean на границе API,
// чтобы фронтенд не разбирался, что здесь означает 0.
function toDayDto(row) {
  return {
    day: row.day,
    worked: row.worked === null ? null : Boolean(row.worked),
    note: row.note || '',
  };
}

function toGoalDto(row) {
  return {
    id: row.id,
    text: row.text,
    done: Boolean(row.done),
    done_at: row.done_at,
  };
}

function toDoubtDto(row) {
  return { id: row.id, text: row.text, day: row.day };
}

// --- чтение ------------------------------------------------------------------

// GET /freeze — всё состояние одним запросом.
// Данных мало (максимум ~93 дня плюс пара десятков записей), поэтому дробить
// на отдельные ручки смысла нет: один round-trip вместо трёх при загрузке.
router.get('/', async (req, res, next) => {
  try {
    const [days, goals, doubts] = await Promise.all([
      db('freeze_days').select('day', 'worked', 'note').orderBy('day', 'asc'),
      db('freeze_goals').select('id', 'text', 'done', 'done_at').orderBy('id', 'asc'),
      db('freeze_doubts').select('id', 'text', 'day').orderBy('id', 'desc'),
    ]);

    res.json({
      start: START,
      end: END,
      days: days.map(toDayDto),
      goals: goals.map(toGoalDto),
      doubts: doubts.map(toDoubtDto),
    });
  } catch (err) {
    next(err);
  }
});

// --- дни ---------------------------------------------------------------------

// PUT /freeze/days/:day — отметка дня. Идемпотентна: повторный вызов
// перезаписывает запись, а не плодит дубликаты (unique по day + upsert).
router.put('/days/:day', async (req, res, next) => {
  try {
    const { day } = req.params;
    if (!isDay(day)) {
      return badRequest(res, 'Day must be a valid date in YYYY-MM-DD format');
    }
    if (!inWindow(day)) {
      return badRequest(res, `Day must be within the freeze window ${START}..${END}`);
    }

    const { worked } = req.body;
    if (worked !== null && worked !== undefined && typeof worked !== 'boolean') {
      return badRequest(res, 'Field "worked" must be true, false or null');
    }

    const note = req.body.note === undefined ? '' : req.body.note;
    if (typeof note !== 'string' || note.length > MAX_NOTE) {
      return badRequest(res, `Field "note" must be a string up to ${MAX_NOTE} characters`);
    }

    const row = {
      day,
      worked: worked === undefined ? null : worked,
      note: note.trim() || null,
      updated_at: new Date(),
    };

    await db('freeze_days').insert(row).onConflict('day').merge();

    res.json(toDayDto(row));
  } catch (err) {
    next(err);
  }
});

// DELETE /freeze/days/:day — стереть день целиком.
// 204 и когда стирать было нечего: результат для клиента тот же — дня нет.
router.delete('/days/:day', async (req, res, next) => {
  try {
    if (!isDay(req.params.day)) {
      return badRequest(res, 'Day must be a valid date in YYYY-MM-DD format');
    }
    await db('freeze_days').where({ day: req.params.day }).del();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- цели --------------------------------------------------------------------

router.post('/goals', async (req, res, next) => {
  try {
    const text = normalizeText(req.body.text, MAX_TEXT);
    if (!text) {
      return badRequest(res, `Field "text" is required and must be up to ${MAX_TEXT} characters`);
    }

    const [id] = await db('freeze_goals').insert({ text });
    res.status(201).json({ id, text, done: false, done_at: null });
  } catch (err) {
    next(err);
  }
});

// PATCH /freeze/goals/:id — изменить текст и/или снять-поставить отметку.
// Снятие отметки обнуляет дату выполнения: хранить «выполнено 3 сентября»
// у невыполненной цели значит показывать пользователю неправду.
router.patch('/goals/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return badRequest(res, 'Goal id must be a positive integer');
    }

    const goal = await db('freeze_goals').where({ id }).first();
    if (!goal) {
      return notFound(res, 'Goal');
    }

    const patch = {};

    if (req.body.text !== undefined) {
      const text = normalizeText(req.body.text, MAX_TEXT);
      if (!text) {
        return badRequest(res, `Field "text" must be a non-empty string up to ${MAX_TEXT} characters`);
      }
      patch.text = text;
    }

    if (req.body.done !== undefined) {
      if (typeof req.body.done !== 'boolean') {
        return badRequest(res, 'Field "done" must be a boolean');
      }
      const day = resolveDay(req.body.day);
      if (day === null) {
        return badRequest(res, 'Field "day" must be a valid date in YYYY-MM-DD format');
      }
      patch.done = req.body.done;
      patch.done_at = req.body.done ? day : null;
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'Nothing to update: provide "text" and/or "done"');
    }

    await db('freeze_goals').where({ id }).update(patch);
    res.json(toGoalDto({ ...goal, ...patch }));
  } catch (err) {
    next(err);
  }
});

router.delete('/goals/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return badRequest(res, 'Goal id must be a positive integer');
    }

    const deleted = await db('freeze_goals').where({ id }).del();
    if (deleted === 0) {
      return notFound(res, 'Goal');
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- сомнения ----------------------------------------------------------------

router.post('/doubts', async (req, res, next) => {
  try {
    const text = normalizeText(req.body.text, MAX_TEXT);
    if (!text) {
      return badRequest(res, `Field "text" is required and must be up to ${MAX_TEXT} characters`);
    }

    const day = resolveDay(req.body.day);
    if (day === null) {
      return badRequest(res, 'Field "day" must be a valid date in YYYY-MM-DD format');
    }

    const [id] = await db('freeze_doubts').insert({ text, day });
    res.status(201).json({ id, text, day });
  } catch (err) {
    next(err);
  }
});

router.delete('/doubts/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return badRequest(res, 'Doubt id must be a positive integer');
    }

    const deleted = await db('freeze_doubts').where({ id }).del();
    if (deleted === 0) {
      return notFound(res, 'Doubt');
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- сброс -------------------------------------------------------------------

// DELETE /freeze — стереть всё. В транзакции: полусброшенное состояние
// (дни стёрлись, цели остались) хуже, чем не сброшенное вовсе.
router.delete('/', async (req, res, next) => {
  try {
    await db.transaction(async (trx) => {
      await trx('freeze_days').del();
      await trx('freeze_goals').del();
      await trx('freeze_doubts').del();
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
