const express = require('express');
const db = require('../db');

const router = express.Router();

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

// GET /themes — список всех тем (для переключателя на фронте)
router.get('/', async (req, res, next) => {
  try {
    const themes = await db('themes').select('id', 'name').orderBy('id', 'asc');
    res.json(themes);
  } catch (err) {
    next(err);
  }
});

// POST /themes — создать новую тему
router.post('/', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const [id] = await db('themes').insert({ name });
    res.status(201).json({ id, name });
  } catch (err) {
    next(err);
  }
});

// POST /themes/:id/steps — добавить шаг в конец темы
router.post('/:id/steps', async (req, res, next) => {
  try {
    const themeId = Number(req.params.id);
    const theme = await db('themes').where({ id: themeId }).first();
    if (!theme) {
      return res.status(404).json({ error: 'Theme not found' });
    }

    const title = (req.body.title || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
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
      description: (req.body.description || '').trim() || null,
      resource_url: (req.body.resource_url || '').trim() || null,
      order_index: orderIndex,
    });

    res.status(201).json({ id, theme_id: themeId, title, order_index: orderIndex });
  } catch (err) {
    next(err);
  }
});

// GET /themes/:id/steps — все шаги темы по порядку с флагом completed
router.get('/:id/steps', async (req, res, next) => {
  try {
    const rows = await stepsWithCompletion(req.params.id);
    res.json(rows.map(toStepDto));
  } catch (err) {
    next(err);
  }
});

// GET /themes/:id/current-step — первый невыполненный шаг
router.get('/:id/current-step', async (req, res, next) => {
  try {
    const rows = await stepsWithCompletion(req.params.id);
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
    const rows = await stepsWithCompletion(req.params.id);
    const total = rows.length;
    const completed = rows.filter((row) => row.completed_at != null).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    res.json({ total, completed, percent });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
