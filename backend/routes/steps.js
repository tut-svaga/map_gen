const express = require('express');
const db = require('../db');
const { badRequest, notFound, parseId, normalizeText, optionalText } = require('../lib/http');

const router = express.Router();

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 500;

// Валидация :id один раз на весь роутер — дальше в обработчиках лежит req.stepId
router.param('id', (req, res, next, value) => {
  const id = parseId(value);
  if (id === null) {
    return badRequest(res, 'Step id must be a positive integer');
  }
  req.stepId = id;
  next();
});

// PATCH /steps/:id — отредактировать шаг.
// Обновляем только те поля, что реально пришли: отсутствие ключа в теле и
// пустая строка — разные намерения («не трогай» против «сотри»).
router.patch('/:id', async (req, res, next) => {
  try {
    const step = await db('steps').where({ id: req.stepId }).first();
    if (!step) {
      return notFound(res, 'Step');
    }

    const patch = {};

    if (req.body.title !== undefined) {
      const title = normalizeText(req.body.title, MAX_TITLE);
      if (!title) {
        return badRequest(res, `Title must be a non-empty string up to ${MAX_TITLE} characters`);
      }
      patch.title = title;
    }

    if (req.body.description !== undefined) {
      const description = optionalText(req.body.description, MAX_DESCRIPTION);
      if (!description.ok) {
        return badRequest(res, `Description must be a string up to ${MAX_DESCRIPTION} characters`);
      }
      patch.description = description.value;
    }

    if (req.body.resource_url !== undefined) {
      const resourceUrl = optionalText(req.body.resource_url, MAX_URL);
      if (!resourceUrl.ok) {
        return badRequest(res, `Resource URL must be a string up to ${MAX_URL} characters`);
      }
      patch.resource_url = resourceUrl.value;
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(res, 'Nothing to update');
    }

    await db('steps').where({ id: req.stepId }).update(patch);
    const updated = { ...step, ...patch };

    res.json({
      id: updated.id,
      title: updated.title,
      description: updated.description,
      resource_url: updated.resource_url,
      order_index: updated.order_index,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /steps/:id — удалить шаг.
// order_index оставшихся не пересчитываем: он задаёт порядок, а не позицию,
// и дырка в нумерации (1, 2, 4) ни на что не влияет. Пересчёт же означал бы
// UPDATE по всей теме на каждое удаление.
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db('steps').where({ id: req.stepId }).del();
    if (deleted === 0) {
      return notFound(res, 'Step');
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /steps/:id/complete — отметить шаг выполненным
router.post('/:id/complete', async (req, res, next) => {
  try {
    const stepId = req.stepId;

    const step = await db('steps').where({ id: stepId }).first();
    if (!step) {
      return notFound(res, 'Step');
    }

    // Идемпотентность: повторный вызов не создаёт дубликат записи в progress
    const existing = await db('progress').where({ step_id: stepId }).first();
    if (existing) {
      if (existing.completed_at == null) {
        // Передаём Date-объект: драйвер сам приведёт к формату MySQL DATETIME
        await db('progress')
          .where({ id: existing.id })
          .update({ completed_at: new Date() });
      }
    } else {
      await db('progress').insert({
        step_id: stepId,
        completed_at: new Date(),
      });
    }

    res.json({ ok: true, step_id: stepId, completed: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /steps/:id/complete — снять отметку.
// Удаляем строку прогресса целиком, а не проставляем completed_at = NULL:
// «шаг не выполнен» и так выражается отсутствием записи, два представления
// одного состояния рано или поздно разъезжаются.
router.delete('/:id/complete', async (req, res, next) => {
  try {
    const step = await db('steps').where({ id: req.stepId }).first();
    if (!step) {
      return notFound(res, 'Step');
    }

    await db('progress').where({ step_id: req.stepId }).del();
    res.json({ ok: true, step_id: req.stepId, completed: false });
  } catch (err) {
    next(err);
  }
});

// POST /steps/:id/move — передвинуть шаг на позицию вверх или вниз.
// Меняем order_index местами с соседом. В транзакции: половина обмена
// оставила бы два шага с одинаковым индексом и непредсказуемым порядком.
router.post('/:id/move', async (req, res, next) => {
  try {
    const { direction } = req.body;
    if (direction !== 'up' && direction !== 'down') {
      return badRequest(res, 'Field "direction" must be "up" or "down"');
    }

    const step = await db('steps').where({ id: req.stepId }).first();
    if (!step) {
      return notFound(res, 'Step');
    }

    const neighbour = await db('steps')
      .where({ theme_id: step.theme_id })
      .andWhere('order_index', direction === 'up' ? '<' : '>', step.order_index)
      .orderBy('order_index', direction === 'up' ? 'desc' : 'asc')
      .first();

    if (!neighbour) {
      // Шаг уже с краю — двигать некуда. Это не ошибка клиента,
      // просто ничего не поменялось.
      return res.json({ ok: true, moved: false });
    }

    await db.transaction(async (trx) => {
      await trx('steps').where({ id: step.id }).update({ order_index: neighbour.order_index });
      await trx('steps').where({ id: neighbour.id }).update({ order_index: step.order_index });
    });

    res.json({ ok: true, moved: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
