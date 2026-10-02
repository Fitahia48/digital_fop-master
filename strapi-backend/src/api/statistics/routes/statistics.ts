/**
 * Routes statistics (visites — table analytique hors Strapi, D7).
 *
 * - `GET /visit-statistics` : URL legacy, **publique** (la page d'accueil
 *   affiche le compteur de visites aux visiteurs anonymes).
 * - `GET /statistics/visit-statistics` : chemin Strapi conservé pour l'admin.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/visit-statistics',
      handler: 'statistics.getVisitStatistics',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/statistics/visit-statistics',
      handler: 'statistics.getVisitStatistics',
      config: { policies: [], middlewares: [] }, // auth (admin)
    },
  ],
};
