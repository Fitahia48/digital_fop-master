/**
 * Route POST /api/visites/ping — comptage anonyme des visites de l'application.
 *
 * Public (aucune authentification : visiteur anonyme), sans corps requis.
 * La limitation de débit vit dans le contrôleur (aucun middleware externe).
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/visites/ping',
      handler: 'visites.ping',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
