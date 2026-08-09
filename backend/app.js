const express = require('express');

const db = require('./db');
const themesRouter = require('./routes/themes');
const stepsRouter = require('./routes/steps');
const freezeRouter = require('./routes/freeze');

const app = express();

app.use(express.json());

// Статику не раздаём: фронтенд — отдельный сервис за nginx.
// Этот сервис — чистый API.

// Liveness: процесс жив и отвечает. База сознательно не проверяется — иначе
// оркестратор перезапустит здоровое приложение из-за недоступной БД,
// а перезапуск базу не чинит.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: можно ли слать трафик. Здесь база нужна — без неё любой
// осмысленный запрос вернёт 500, и лучше временно выпасть из балансировки.
app.get('/ready', async (req, res) => {
  try {
    await db.raw('select 1');
    res.json({ status: 'ready' });
  } catch (err) {
    console.error('Readiness check failed:', err.message);
    res.status(503).json({ status: 'unavailable' });
  }
});

app.use('/themes', themesRouter);
app.use('/steps', stepsRouter);
app.use('/freeze', freezeRouter);

// Неизвестный путь — 404 в том же JSON-формате, что и остальные ошибки.
// Без этого Express отдаёт HTML-страницу, и фронтенд спотыкается на res.json().
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Централизованный обработчик ошибок: роуты передают ошибки через next(err).
// Четвёртый аргумент обязателен по арности — без него Express считает это
// обычным middleware, а не обработчиком ошибок.
app.use((err, req, res, _next) => {
  // Битый JSON в теле — вина клиента, а не сервера. express.json() бросает
  // SyntaxError со статусом, и отдавать на него 500 значит врать в мониторинг.
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
