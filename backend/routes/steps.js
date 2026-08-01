const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /steps/:id/complete — отметить шаг выполненным
router.post('/:id/complete', async (req, res, next) => {
  try {
    const stepId = Number(req.params.id);

    const step = await db('steps').where({ id: stepId }).first();
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
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

    res.json({ ok: true, step_id: stepId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
