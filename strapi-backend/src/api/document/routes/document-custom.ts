/**
 * Routes custom document (endpoints non-CRUD du legacy Express).
 *
 * Deux familles de chemins sont exposées :
 *  - les chemins Strapi « modernes » (`/documents/...`), avec `:documentId` ;
 *  - les alias legacy (`/most-visited`, `/document-stats`, …) consommés par le
 *    front React existant, afin qu'aucune adaptation front ne soit nécessaire.
 */
export default {
  routes: [
    // ─── Compteurs de consultation ──────────────────────────────────────────
    {
      method: 'POST',
      path: '/documents/:documentId/visit',
      handler: 'document.incrementVisit',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/documents/:documentId/telechargement',
      handler: 'document.incrementTelechargement',
      config: { auth: false, policies: [], middlewares: [] },
    },

    // ─── Classements / statistiques / suggestions ───────────────────────────
    {
      method: 'GET',
      path: '/documents/most-visited',
      handler: 'document.mostVisited',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/most-visited',
      handler: 'document.mostVisited',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/documents/stats',
      handler: 'document.documentStats',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/document-stats',
      handler: 'document.documentStats',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/documents/stats-api',
      handler: 'document.documentStatsApi',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'GET',
      path: '/documents-stats',
      handler: 'document.documentStatsApi',
      config: { auth: false, policies: [], middlewares: [] }, // alias legacy public
    },
    {
      method: 'GET',
      path: '/documents/suggestions',
      handler: 'document.suggestions',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/suggestions',
      handler: 'document.suggestions',
      config: { auth: false, policies: [], middlewares: [] },
    },

    // ─── Validation juridique (rôle habilité, justification + audit) ────────
    {
      method: 'PATCH',
      path: '/documents/:documentId/status',
      handler: 'document.updateStatus',
      config: { policies: [], middlewares: [] }, // habilité (contrôle dans le handler)
    },
    {
      method: 'GET',
      path: '/documents/:documentId/statut-historique',
      handler: 'document.statutHistorique',
      config: { policies: [], middlewares: [] }, // habilité (contrôle dans le handler)
    },

    // ─── État éditorial de la notice (admin) ────────────────────────────────
    {
      method: 'PATCH',
      path: '/documents/:documentId/etat-notice',
      handler: 'document.setEtatNotice',
      config: { policies: [], middlewares: [] }, // admin
    },

    // ─── Mise à jour (le front appelle PATCH ; le core ne définit que PUT) ──
    // Réutilise le handler core `document.update` → action déjà attribuée
    // (Administrateur), aucune permission supplémentaire requise.
    {
      method: 'PATCH',
      path: '/documents/:documentId',
      handler: 'document.update',
      config: { policies: [], middlewares: [] }, // admin
    },
  ],
};
