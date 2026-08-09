const path = require('path');

// Конфиг только из окружения — никаких дефолтов для подключения к БД.
// Дефолт вида DB_HOST='localhost' опаснее, чем его отсутствие: приложение
// стартует, выглядит здоровым и падает только на первом запросе к базе.
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
      'See backend/.env.example for the full list.'
  );
}

const config = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    // Порт — не секрет и не зависит от окружения, 3306 стандартный
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  migrations: {
    directory: path.join(__dirname, 'db', 'migrations'),
  },
  seeds: {
    directory: path.join(__dirname, 'db', 'seeds'),
  },
};

// Один и тот же конфиг под всеми окружениями. Отличия между dev, test и prod
// целиком задаются переменными окружения — держать три копии одинаковых
// блоков значит однажды поправить один и забыть про остальные.
// Ключи перечислены явно: в образе стоит NODE_ENV=production, и раньше
// knexConfig[environment] возвращал undefined, а контейнер падал на старте.
module.exports = {
  development: config,
  test: config,
  production: config,
};
