exports.up = function up(knex) {
  return knex.schema.createTable('themes', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('themes');
};
