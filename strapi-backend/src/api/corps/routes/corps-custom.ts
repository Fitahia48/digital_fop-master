/**
 * Routes custom corps (URLs legacy — aucune adaptation front requise).
 *
 * Les routes CRUD core restent exposées sous `/api/organismes` (contrainte
 * Strapi singularName ≠ pluralName, cf. MIGRATION.md 3d) ; le préfixe legacy
 * `/api/corps/...` pour les lectures/écritures CRUD relève de l'étape 7.
 * Ici : uniquement les endpoints de logique custom (filtres, compteurs, stats).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/corps-filter',
      handler: 'corps.filtered',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/corps-professionnels',
      handler: 'corps.professionnels',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/most-visited-corps',
      handler: 'corps.mostVisited',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/corps-stats',
      handler: 'corps.stats',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/corps-stats1',
      handler: 'corps.statsApi',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'POST',
      path: '/corps/:documentId/visit',
      handler: 'corps.incrementVisit',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/corps/:documentId/telechargement',
      handler: 'corps.incrementTelechargement',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/corps/:documentId/update_status',
      handler: 'corps.updateStatus',
      config: { policies: [], middlewares: [] }, // admin
    },

    // ─── CRUD legacy `/api/corps/...` ───────────────────────────────────────
    // Le core expose le pluriel `organismes` ; le front appelle `corps`.
    // Les handlers core sont réutilisés (mêmes actions → permissions inchangées).
    {
      method: 'POST',
      path: '/corps',
      handler: 'corps.create',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'GET',
      path: '/corps/:documentId',
      handler: 'corps.findOne',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/corps/:documentId',
      handler: 'corps.update',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'PATCH',
      path: '/corps/:documentId',
      handler: 'corps.update',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'DELETE',
      path: '/corps/:documentId',
      handler: 'corps.delete',
      config: { policies: [], middlewares: [] }, // admin
    },
  ],
};
