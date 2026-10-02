/**
 * Route publique : catalogue des types de démarches actifs (sans compte).
 * Langue via ?lang=fr|en|mg (défaut fr).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/types-demarche',
      handler: 'type-demarche.listActive',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
