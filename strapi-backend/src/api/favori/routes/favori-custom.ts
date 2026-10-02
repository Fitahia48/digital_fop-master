/**
 * Routes custom favori (URLs legacy — aucune adaptation front requise).
 * Auth requise : seuls les rôles Public/Authenticated/Administrateur disposant
 * des scopes correspondants peuvent appeler (voir scripts/assign-permissions.ts).
 * Les routes core (`api::favori.favori`) restent disponibles pour l'admin.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/favoris',
      handler: 'favori.addFavori',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/favoris',
      handler: 'favori.myFavoris',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/favoris/:documentId',
      handler: 'favori.removeFavori',
      config: { policies: [], middlewares: [] },
    },
  ],
};
