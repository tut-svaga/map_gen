exports.up = function up(knex) {
  return knex.schema.createTable('freeze_doubts', (table) => {
    table.increments('id').primary();
    table.string('text', 500).notNullable();
    // День, когда сомнение записали, 'YYYY-MM-DD'
    table.string('day', 10).notNullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('freeze_doubts');
};
