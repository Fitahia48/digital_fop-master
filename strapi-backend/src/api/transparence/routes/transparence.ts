/**
 * Routes custom de transparence (F12).
 * GET /api/transparence/stats — volontairement PUBLIQUE : aucune authentification,
 * aucune donnée personnelle. Alimente la page /transparence.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/transparence/stats',
      handler: 'transparence.getStatsPubliques',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
