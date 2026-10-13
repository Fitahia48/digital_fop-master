/**
 * Suppression des tables des démarches, favoris et de leurs content-types
 * associés (décision : l'application ne propose plus de démarches en ligne ni
 * de favoris — seuls les textes réglementaires restent).
 *
 * Tables concernées (collectionName Strapi) :
 *  - demarche + pièces jointes + timeline (+ tables de liaison)
 *  - type-demarche, direction (routage des démarches), compteur-dossier
 *  - favori (+ tables de liaison)
 *
 * CONTRAINTE : ne touche à AUCUNE table de documents / actualités /
 * organigramme. Idempotent (hasTable) et tolerant (IF EXISTS) : rejouable sur
 * une base legacy Postgres comme sur la sqlite locale.
 *
 * Ordre : d'abord les tables de liaison (FK vers les tables mères), puis les
 * tables mères.
 */

const LIAISONS = [
  'strapi_demarches_agent_affecte_lnk',
  'strapi_demarches_direction_lnk',
  'strapi_demarches_document_lnk',
  'strapi_demarches_type_lnk',
  'strapi_demarches_user_lnk',
  'strapi_demarche_timeline_demarche_lnk',
  'strapi_demarche_timeline_modifie_par_lnk',
  'strapi_demarche_pieces_jointes_demarche_lnk',
  'strapi_demarche_pieces_jointes_fichier_prive_lnk',
  'strapi_type_demarches_direction_lnk',
  'strapi_directions_parent_lnk',
  'strapi_favoris_document_lnk',
  'strapi_favoris_user_lnk',
];

const CONTENT_TYPES = [
  'strapi_demarches',
  'strapi_demarche_timeline',
  'strapi_demarche_pieces_jointes',
  'strapi_type_demarches',
  'strapi_directions',
  'strapi_favoris',
  'strapi_compteur_dossiers',
];

module.exports = {
  async up(knex) {
    for (const table of [...LIAISONS, ...CONTENT_TYPES]) {
      if (await knex.schema.hasTable(table)) {
        await knex.schema.dropTable(table);
      }
    }
  },

  async down() {
    // Irréversible : les tables contenaient des données de démarches/favoris
    // volontairement supprimées (aucune conservation requise).
  },
};
