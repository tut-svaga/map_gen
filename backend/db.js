const knex = require('knex');
const knexConfig = require('./knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

// Без этой проверки неизвестный NODE_ENV даёт config === undefined, и knex
// падает с невнятным «Knex: Required configuration option 'client' is missing».
// Ошибка называет причину прямо, чтобы не искать её в стеке чужой библиотеки.
if (!config) {
  throw new Error(
    `Unknown NODE_ENV="${environment}". Known environments: ${Object.keys(knexConfig).join(', ')}.`
  );
}

module.exports = knex(config);
