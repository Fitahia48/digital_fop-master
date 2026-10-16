/**
 * Tables analytiques hors Strapi (D7) encore absentes de la base locale :
 * `document_stats`, `corps_stats`, `api_quota_usage`.
 *
 * Utilisées en SQL direct par :
 *  - src/api/document/controllers/document.ts → GET /api/documents-stats
 *  - src/api/corps/controllers/corps.ts       → GET /api/corps-stats1
 *  - src/api/search/controllers/search.ts     → quota journalier Google PSE
 *
 * Sans elles : 500 « no such table: document_stats » sur les endpoints de
 * statistiques (et échec silencieux du quota Google, dont l'erreur est avalée).
 *
 * Contraintes imposées par les requêtes :
 *  - `date` au format AAAA-MM-JJ (comparaisons `date = ?` / `date BETWEEN ? AND ?`) ;
 *  - compteurs `daily_count` / `monthly_count` / `yearly_count` NOT NULL défaut 0
 *    (les SELECT font COALESCE(SUM(...),0)) ;
 *  - `api_quota_usage.date` UNIQUE, requis par `ON CONFLICT (date) DO NOTHING`.
 *
 * Idempotent (hasTable) : rejouable sur une base legacy postgres où ces tables
 * existent déjà comme sur la sqlite locale.
 */
module.exports = {
  async up(knex) {
    if (!(await knex.schema.hasTable('document_stats'))) {
      await knex.schema.createTable('document_stats', (table) => {
        table.bigIncrements('id');
        table.date('date').notNullable().unique();
        table.integer('daily_count').notNullable().defaultTo(0);
        table.integer('monthly_count').notNullable().defaultTo(0);
        table.integer('yearly_count').notNullable().defaultTo(0);
      });
    }

    if (!(await knex.schema.hasTable('corps_stats'))) {
      await knex.schema.createTable('corps_stats', (table) => {
        table.bigIncrements('id');
        table.date('date').notNullable().unique();
        table.integer('daily_count').notNullable().defaultTo(0);
        table.integer('monthly_count').notNullable().defaultTo(0);
        table.integer('yearly_count').notNullable().defaultTo(0);
      });
    }

    if (!(await knex.schema.hasTable('api_quota_usage'))) {
      await knex.schema.createTable('api_quota_usage', (table) => {
        table.bigIncrements('id');
        table.date('date').notNullable().unique();
        table.integer('count').notNullable().defaultTo(0);
      });
    }
  },

  async down(knex) {
    for (const table of ['document_stats', 'corps_stats', 'api_quota_usage']) {
      if (await knex.schema.hasTable(table)) {
        await knex.schema.dropTable(table);
      }
    }
  },
};
