exports.up = function up(knex) {
  return knex.schema.createTable('freeze_days', (table) => {
    table.increments('id').primary();
    // Дата строкой 'YYYY-MM-DD', а не типом DATE. Драйвер отдаёт DATE как
    // JS Date в локальной зоне, а JSON.stringify переводит его в UTC — день
    // уезжает на сутки назад для всех, кто восточнее Гринвича. Календарная
    // дата здесь не момент времени, арифметика по ней не нужна, поэтому
    // строка честнее и не зависит от TZ контейнера.
    table.string('day', 10).notNullable().unique();
    // NULL = день открыт (есть заметка, но отметки «работал/не работал» нет).
    // Строка целиком отсутствует, если день не трогали.
    table.boolean('worked').nullable();
    table.text('note');
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('freeze_days');
};
