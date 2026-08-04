exports.up = function up(knex) {
  return knex.schema.createTable('progress', (table) => {
    table.increments('id').primary();
    table
      .integer('step_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('steps')
      .onDelete('CASCADE');
    // NULL = шаг ещё не выполнен; заполняется при отметке "Выполнено".
    // datetime, а не timestamp: у MySQL TIMESTAMP ограничен 2038 годом
    table.datetime('completed_at').nullable();
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('progress');
};
