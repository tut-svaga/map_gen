// Точка входа: поднимает HTTP-сервер.
// Само приложение живёт в app.js — так его можно импортировать в тестах,
// не занимая порт.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
