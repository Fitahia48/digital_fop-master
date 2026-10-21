/**
 * Tables du comptage anonyme « un visiteur = 1 par jour » (D7 : tables
 * analytiques HORS content-types), jour en fuseau Indian/Antananarivo.
 *
 * Consommateurs :
 *  - src/utils/visitor-id.ts          : empreinte (HMAC-SHA256 selé par jour)
 *  - src/api/visites (POST /ping)     : visites_visiteurs + totaux_jour
 *  - document.incrementVisit / corps.incrementVisit
 *                                       : consultations_visiteurs + totaux_jour
 *  - src/index.ts (purge)             : suppression des empreintes > rétention
 *  - src/api/statistics/controllers/statistics.ts (séries / visiteurs du jour)
 *
 * Contraintes imposées par les requêtes :
 *  - `visites_visiteurs` UNIQUE (jour, visiteur_hash)  → ON CONFLICT DO NOTHING
 *    garantit l'unicité (et non un SELECT préalable) ;
 *  - `consultations_visiteurs` UNIQUE (jour, visiteur_hash, type_cible, cible_id)
 *    → 1 consultation par visiteur, par texte, par jour ;
 *    INDEX (type_cible, cible_id) pour les purges et les lectures par cible ;
 *  - `totaux_jour.jour` PRIMARY KEY → historique des totaux conservé après
 *    purge des empreintes.
 *
 * Seed NON destructif : `totaux_jour` est amorcé avec les `unique_visitors`
 * déjà présents dans `daily_stats` (aucune IP, aucun agrégat supprimé) pour
 * que les séries des statistiques restent continues. `ON CONFLICT DO NOTHING`
 * : un jour déjà présent n'est jamais écrasé. Idempotent (hasTable).
 *
 * API des migrations Strapi 5 : `up(trx, db)` → knex (même convention que
 * 20261006150000-create-visits.js).
 */
module.exports = {
  async up(knex) {
    if (!(await knex.schema.hasTable('visites_visiteurs'))) {
      await knex.schema.createTable('visites_visiteurs', (table) => {
        table.bigIncrements('id');
        table.date('jour').notNullable();
        table.string('visiteur_hash', 64).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['jour', 'visiteur_hash'], {
          indexName: 'visites_visiteurs_jour_hash_unique',
        });
      });
    }

    if (!(await knex.schema.hasTable('consultations_visiteurs'))) {
      await knex.schema.createTable('consultations_visiteurs', (table) => {
        table.bigIncrements('id');
        table.date('jour').notNullable();
        table.string('visiteur_hash', 64).notNullable();
        // 'document' | 'corps' (liste courte : pas de FK, tables analytiques)
        table.string('type_cible', 16).notNullable();
        table.integer('cible_id').notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['jour', 'visiteur_hash', 'type_cible', 'cible_id'], {
          indexName: 'consultations_visiteurs_uniq',
        });
        table.index(['type_cible', 'cible_id'], 'consultations_visiteurs_cible_index');
      });
    }

    if (!(await knex.schema.hasTable('totaux_jour'))) {
      await knex.schema.createTable('totaux_jour', (table) => {
        table.date('jour').primary();
        table.integer('visiteurs').notNullable().defaultTo(0);
        table.integer('consultations').notNullable().defaultTo(0);
      });
    }

    // Amorçage historique (additif, jamais destructif) : les jours déjà
    // préservés dans daily_stats → totaux_jour.visiteurs.
    try {
      const dejaAmorce = await knex('totaux_jour').count('* as n').first();
      if (Number(dejaAmorce?.n ?? 0) === 0 && (await knex.schema.hasTable('daily_stats'))) {
        await knex.raw(`
          INSERT INTO totaux_jour (jour, visiteurs, consultations)
          SELECT visit_date, unique_visitors, 0 FROM daily_stats
          ON CONFLICT (jour) DO NOTHING
        `);
      }
    } catch (err) {
      // L'amorçage est best-effort : un souci ici ne doit pas bloquer la
      // migration (les jours manquants sont recréés à l'usage).
      console.warn(`[migration] amorçage totaux_jour ignoré : ${err.message}`);
    }
  },

  async down(knex) {
    for (const table of ['consultations_visiteurs', 'visites_visiteurs', 'totaux_jour']) {
      if (await knex.schema.hasTable(table)) {
        await knex.schema.dropTable(table);
      }
    }
  },
};
