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
    // NULL = шаг ещё не выполнен; заполняется при отметке "Выполнено"
    table.timestamp('completed_at').nullable();
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('progress');
};
