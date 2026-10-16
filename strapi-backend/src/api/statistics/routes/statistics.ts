/**
 * Routes statistics (visites — table analytique hors Strapi, D7).
 *
 * - `GET /visit-statistics` : URL legacy, désormais authentifiée et réservée aux admins.
 * - `GET /statistics/visit-statistics` : chemin Strapi conservé pour l'admin.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/visit-statistics',
      handler: 'statistics.getVisitStatistics',
      config: { policies: [], middlewares: [] }, // auth requis, vérification admin dans le contrôleur
    },
    {
      method: 'GET',
      path: '/statistics/visit-statistics',
      handler: 'statistics.getVisitStatistics',
      config: { policies: [], middlewares: [] }, // auth requis, vérification admin dans le contrôleur
    },
  ],
};