import { factories } from '@strapi/strapi';

/**
 * Routes custom de recherche.
 * Note : l'auth est facultative sur POST /api/search (usagers anonymes admis),
 * gérée via config.auth (voir ./routes.ts).
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/search',
      handler: 'search.webSearch',
      config: {
        // 'false' → la stratégie U&P résout l'usager si un JWT est fourni,
        // sinon la requête continue en anonyme (auth facultative).
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/search/history',
      handler: 'search.getSearchHistory',
      config: {
        // Auth requise : le scope api::search.search.getSearchHistory doit être
        // activé pour le rôle Authenticated (voir scripts/assign-permissions.ts).
        policies: [],
        middlewares: [],
      },
    },
  ],
};
