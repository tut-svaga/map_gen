const express = require('express');

const themesRouter = require('./routes/themes');
const stepsRouter = require('./routes/steps');

const app = express();

app.use(express.json());

// Статику не раздаём: фронтенд — отдельный сервис за nginx.
// Этот сервис — чистый API.

app.use('/themes', themesRouter);
app.use('/steps', stepsRouter);

// Централизованный обработчик ошибок: роуты передают ошибки через next(err).
// Четвёртый аргумент обязателен по арности — без него Express считает это
// обычным middleware, а не обработчиком ошибок.
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
