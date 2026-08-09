const express = require('express');
const db = require('../db');
const { badRequest, notFound, parseId, normalizeText, optionalText } = require('../lib/http');

const router = express.Router();

const MAX_NAME = 200;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_URL = 500;

// Валидация :id один раз на весь роутер. router.param срабатывает до самих
// обработчиков, поэтому дальше в них id уже гарантированно положительное целое
// и лежит в req.themeId — проверку не нужно повторять в каждой ручке.
router.param('id', (req, res, next, value) => {
  const id = parseId(value);
  if (id === null) {
    return badRequest(res, 'Theme id must be a positive integer');
  }
  req.themeId = id;
  next();
});

// Базовый запрос: шаги темы + флаг completed.
// LEFT JOIN на progress: если записи нет или completed_at IS NULL — шаг не выполнен.
function stepsWithCompletion(themeId) {
  return db('steps')
    .leftJoin('progress', 'steps.id', 'progress.step_id')
    .where('steps.theme_id', themeId)
    .select(
      'steps.id',
      'steps.title',
      'steps.description',
      'steps.resource_url',
      'steps.order_index',
      'progress.completed_at'
    )
    .orderBy('steps.order_index', 'asc');
}

function toStepDto(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    resource_url: row.resource_url,
    order_index: row.order_index,
    completed: row.completed_at != null,
  };
}

function percentOf(completed, total) {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

// GET /themes — список тем со счётчиками шагов.
// Счётчики отдаём сразу: без них фронтенду пришлось бы дёргать /progress
// по каждой теме отдельно, то есть N+1 запросов ради одной строки в списке.
router.get('/', async (req, res, next) => {
  try {
    const [themes, counts] = await Promise.all([
      db('themes').select('id', 'name').orderBy('id', 'asc'),
      db('steps')
        .leftJoin('progress', 'steps.id', 'progress.step_id')
        .select('steps.theme_id')
        // COUNT(column) не считает NULL — поэтому по completed_at сразу
        // получается число выполненных, без CASE WHEN
        .count({ total: 'steps.id' })
        .count({ completed: 'progress.completed_at' })
        .groupBy('steps.theme_id'),
    ]);

    const byTheme = new Map(counts.map((row) => [row.theme_id, row]));

    res.json(
      themes.map((theme) => {
        const row = byTheme.get(theme.id);
        const total = row ? Number(row.total) : 0;
        const completed = row ? Number(row.completed) : 0;
        return { id: theme.id, name: theme.name, total, completed, percent: percentOf(completed, total) };
      })
    );
  } catch (err) {
    next(err);
  }
});

// POST /themes — создать новую тему
router.post('/', async (req, res, next) => {
  try {
    const name = normalizeText(req.body.name, MAX_NAME);
    if (!name) {
      return badRequest(res, `Name is required and must be up to ${MAX_NAME} characters`);
    }
    const [id] = await db('themes').insert({ name });
    res.status(201).json({ id, name, total: 0, completed: 0, percent: 0 });
  } catch (err) {
    next(err);
  }
});

// PATCH /themes/:id — переименовать тему
router.patch('/:id', async (req, res, next) => {
  try {
    const id = req.themeId;
    const name = normalizeText(req.body.name, MAX_NAME);
    if (!name) {
      return badRequest(res, `Name is required and must be up to ${MAX_NAME} characters`);
    }

    const updated = await db('themes').where({ id }).update({ name });
    if (updated === 0) {
      return notFound(res, 'Theme');
    }
    res.json({ id, name });
  } catch (err) {
    next(err);
  }
});

// DELETE /themes/:id — удалить тему.
// Шаги и записи прогресса уезжают следом: у внешних ключей ON DELETE CASCADE,
// так что чистит их база, а не приложение.
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db('themes').where({ id: req.themeId }).del();
    if (deleted === 0) {
      return notFound(res, 'Theme');
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /themes/:id/steps — добавить шаг в конец темы
router.post('/:id/steps', async (req, res, next) => {
  try {
    const themeId = req.themeId;
    const theme = await db('themes').where({ id: themeId }).first();
    if (!theme) {
      return notFound(res, 'Theme');
    }

    const title = normalizeText(req.body.title, MAX_TITLE);
    if (!title) {
      return badRequest(res, `Title is required and must be up to ${MAX_TITLE} characters`);
    }

    const description = optionalText(req.body.description, MAX_DESCRIPTION);
    if (!description.ok) {
      return badRequest(res, `Description must be a string up to ${MAX_DESCRIPTION} characters`);
    }

    const resourceUrl = optionalText(req.body.resource_url, MAX_URL);
    if (!resourceUrl.ok) {
      return badRequest(res, `Resource URL must be a string up to ${MAX_URL} characters`);
    }

    // Новый шаг встаёт в конец: order_index = максимальный в теме + 1
    const maxRow = await db('steps')
      .where({ theme_id: themeId })
      .max('order_index as max')
      .first();
    const orderIndex = (maxRow.max || 0) + 1;

    const [id] = await db('steps').insert({
      theme_id: themeId,
      title,
      description: description.value,
      resource_url: resourceUrl.value,
      order_index: orderIndex,
    });

    res.status(201).json({
      id,
      title,
      description: description.value,
      resource_url: resourceUrl.value,
      order_index: orderIndex,
      completed: false,
    });
  } catch (err) {
    next(err);
  }
});

// GET /themes/:id/steps — все шаги темы по порядку с флагом completed
router.get('/:id/steps', async (req, res, next) => {
  try {
    const rows = await stepsWithCompletion(req.themeId);
    res.json(rows.map(toStepDto));
  } catch (err) {
    next(err);
  }
});

// GET /themes/:id/current-step — первый невыполненный шаг
router.get('/:id/current-step', async (req, res, next) => {
  try {
    const rows = await stepsWithCompletion(req.themeId);
    const current = rows.find((row) => row.completed_at == null);
    if (!current) {
      // Все шаги выполнены (или шагов нет) — фронтенд покажет поздравление
      return res.json(null);
    }
    res.json(toStepDto(current));
  } catch (err) {
    next(err);
  }
});

// GET /themes/:id/progress — процент выполненных шагов
router.get('/:id/progress', async (req, res, next) => {
  try {
    const rows = await stepsWithCompletion(req.themeId);
    const total = rows.length;
    const completed = rows.filter((row) => row.completed_at != null).length;
    res.json({ total, completed, percent: percentOf(completed, total) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
