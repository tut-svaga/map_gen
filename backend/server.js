const express = require('express');

const themesRouter = require('./routes/themes');
const stepsRouter = require('./routes/steps');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Статику больше не раздаём: фронтенд — отдельный сервис за nginx.
// Этот сервис — чистый API.

app.use('/themes', themesRouter);
app.use('/steps', stepsRouter);

// Централизованный обработчик ошибок: роуты передают ошибки через next(err)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
