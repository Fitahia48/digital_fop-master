/**
 * Tables analytiques des visites quotidiennes (D7 : hors content-types).
 *
 * Utilisées en SQL direct par :
 *  - src/middlewares/track-visit.ts
 *      `INSERT INTO daily_stats (visit_date, total_visits) ... ON CONFLICT (visit_date)`
 *      `SELECT/INSERT INTO visitor_daily (hash, date)`
 *  - src/api/statistics/controllers/statistics.ts (GET /api/statistics/visit-statistics)
 *
 * Contraintes imposées par ces requêtes :
 *  - `daily_stats.visit_date` UNIQUE (le ON CONFLICT a besoin de la contrainte) ;
 *  - `daily_stats.total_visits` / `unique_visitors` NOT NULL avec défaut 0, car
 *    chaque INSERT ne fournit qu'une des deux colonnes ;
 *  - `visitor_daily` UNIQUE (hash, date) pour ne compter qu'un visiteur unique
 *    par jour.
 *
 * L'API des migrations Strapi 5 (resolver.js → wrapTransaction) appelle
 * `up(trx, db)` : le premier argument est l'instance knex de la transaction
 * (comme dans 20261006150000-create-visits.js), donc on utilise
 * `knex.schema`, et non une signature `{ queryInterface, Sequelize }`.
 *
 * Idempotent (hasTable) : rejouable sur une base legacy Postgres où les tables
 * existent déjà comme sur la sqlite locale.
 */
module.exports = {
  async up(knex) {
    if (!(await knex.schema.hasTable('visitor_daily'))) {
      await knex.schema.createTable('visitor_daily', (table) => {
        table.bigIncrements('id');
        table.string('hash', 255).notNullable();
        table.date('date').notNullable();
        table.unique(['hash', 'date'], { indexName: 'visitor_daily_hash_date_unique' });
      });
    }

    if (!(await knex.schema.hasTable('daily_stats'))) {
      await knex.schema.createTable('daily_stats', (table) => {
        table.bigIncrements('id');
        table.date('visit_date').notNullable().unique();
        table.integer('unique_visitors').notNullable().defaultTo(0);
        table.integer('total_visits').notNullable().defaultTo(0);
      });
    }
  },

  async down(knex) {
    if (await knex.schema.hasTable('visitor_daily')) {
      await knex.schema.dropTable('visitor_daily');
    }
    if (await knex.schema.hasTable('daily_stats')) {
      await knex.schema.dropTable('daily_stats');
    }
  },
};
