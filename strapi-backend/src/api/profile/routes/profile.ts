/**
 * Routes du profil de l'usager connecté.
 *
 * `policies: []` sans `auth: false` : le routeur exige un jeton valide, et
 * l'identité est lue dans `ctx.state.user` (jamais dans le corps/les paramètres).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/v1/profile',
      handler: 'profile.get',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/v1/profile',
      handler: 'profile.update',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/profile/password',
      handler: 'profile.changePassword',
      config: { policies: [], middlewares: [] },
    },
  ],
};
