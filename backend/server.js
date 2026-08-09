// Точка входа: поднимает HTTP-сервер.
// Само приложение живёт в app.js — так его можно импортировать в тестах,
// не занимая порт.
const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Оркестратор при выкатке шлёт SIGTERM и ждёт. Без обработчика процесс
// умирает мгновенно, обрывая запросы в полёте и не отпуская пул соединений
// к MySQL. Здесь: перестаём принимать новые соединения, доотвечаем текущим,
// закрываем пул.
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  // Страховка от зависшего keep-alive соединения: если за 10 секунд закрыться
  // не вышло, выходим принудительно — иначе оркестратор всё равно прибьёт
  // процесс SIGKILL, но уже без шанса закрыть пул.
  const force = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    try {
      await db.destroy();
      process.exit(0);
    } catch (err) {
      console.error('Failed to close the database pool:', err.message);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
