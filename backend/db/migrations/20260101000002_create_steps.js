exports.up = function up(knex) {
  return knex.schema.createTable('steps', (table) => {
    table.increments('id').primary();
    table
      .integer('theme_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('themes')
      .onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('description');
    table.string('resource_url');
    table.integer('order_index').notNullable();
  });
};

exports.down = function down(knex) {
  return knex.schema.dropTableIfExists('steps');
};
