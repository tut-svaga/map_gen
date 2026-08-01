const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'db', 'dev.sqlite3'),
    },
    // sqlite3 не поддерживает несколько соединений на запись — держим пул минимальным
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'db', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'db', 'seeds'),
    },
  },
};
