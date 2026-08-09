exports.up = function up(knex) {
  return knex.schema.createTable('freeze_goals', (table) => {
    table.increments('id').primary();
    table.string('text', 500).notNullable();
    table.boolean('done').notNullable().defaultTo(false);
    // День выполнения, 'YYYY-MM-DD' — см. комментарий в create_freeze_days
    table.string('done_at', 10).nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('freeze_goals');
};
