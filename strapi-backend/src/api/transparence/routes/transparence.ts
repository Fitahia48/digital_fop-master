/**
 * Routes custom de transparence (F12).
 * GET /api/transparence/stats — désormais réservée aux admins authentifiés.
 * Aucune donnée personnelle n'est exposée.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/transparence/stats',
      handler: 'transparence.getStatsPubliques',
      config: {
        // auth requis, vérification admin dans le contrôleur
        policies: [],
        middlewares: [],
      },
    },
  ],
};