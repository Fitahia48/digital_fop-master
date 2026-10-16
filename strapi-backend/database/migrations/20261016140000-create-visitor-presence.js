/**
 * Table de présence « en ligne » (temps réel) — analytique, hors Strapi (D7).
 *
 * Utilisée en SQL direct par :
 *  - src/middlewares/track-visit.ts               → upsert du dernier passage
 *  - src/api/statistics/controllers/statistics.ts → `visitors_online`
 *    (nombre de visiteurs distincts vus dans les dernières minutes)
 *
 * Contraintes imposées par les requêtes :
 *  - `hash` UNIQUE : une seule ligne par visiteur (même hash que
 *    `visitor_daily`, calculé sur IP + user-agent + jour + VISITOR_SECRET),
 *    requis par le `ON CONFLICT (hash) DO UPDATE ... last_seen_at` ;
 *  - `last_seen_at` : epoch en SECONDES (entier, comparable directement dans
 *    tous les dialectes — pas de conversion de date) ;
 *  - index sur `last_seen_at` : la lecture (`>= seuil`) et la purge
 *    (`< seuil de rétention`) sont des balayages d'index.
 *
 * Table volontairement bornée : au plus un enregistrement par visiteur, et les
 * lignes plus vieilles que la rétention sont supprimées par le middleware.
 *
 * Idempotent (hasTable) : rejouable sur une base legacy postgres comme sur la
 * sqlite locale.
 */
module.exports = {
  async up(knex) {
    if (!(await knex.schema.hasTable('visitor_presence'))) {
      await knex.schema.createTable('visitor_presence', (table) => {
        table.bigIncrements('id');
        table.string('hash', 64).notNullable().unique();
        table.bigInteger('last_seen_at').notNullable();
        table.index(['last_seen_at'], 'visitor_presence_last_seen_at_index');
      });
    }
  },

  async down(knex) {
    if (await knex.schema.hasTable('visitor_presence')) {
      await knex.schema.dropTable('visitor_presence');
    }
  },
};
