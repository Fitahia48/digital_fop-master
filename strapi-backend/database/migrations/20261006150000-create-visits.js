/**
 * Table analytique `visits` (D7 : tables analytiques HORS content-types).
 *
 * Utilisée en SQL direct par :
 *  - src/middlewares/track-visit.ts (INSERT à chaque GET public)
 *  - src/api/statistics/controllers/statistics.ts (GET /api/visit-statistics)
 *
 * Présente sur le Postgres legacy, absente d'une base neuve (sqlite locale) →
 * le 500 « no such table: visits ». Migration idempotente : elle ne crée rien
 * si la table existe déjà (base legacy non altérée).
 */
module.exports = {
  async up(knex) {
    if (await knex.schema.hasTable('visits')) return;

    await knex.schema.createTable('visits', (table) => {
      table.increments('id').primary();
      table.string('ip_address', 64);
      table.string('user_agent', 512);
      table.date('visit_date');
      table.index(['visit_date']);
    });
  },

  async down(knex) {
    if (await knex.schema.hasTable('visits')) {
      await knex.schema.dropTable('visits');
    }
  },
};
