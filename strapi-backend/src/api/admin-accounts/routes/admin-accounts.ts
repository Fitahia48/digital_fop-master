/**
 * Routes de gestion des comptes administrateurs.
 *
 * `policies: []` sans `auth: false` : un jeton valide est exigé par le routeur,
 * puis le contrôleur vérifie que l'usager est super-administrateur (403 sinon).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/v1/admin-accounts',
      handler: 'admin-accounts.list',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/admin-accounts',
      handler: 'admin-accounts.create',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/v1/admin-accounts/:id/status',
      handler: 'admin-accounts.updateStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/v1/admin-accounts/:id/role',
      handler: 'admin-accounts.updateRole',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/v1/admin-accounts/:id',
      handler: 'admin-accounts.remove',
      config: { policies: [], middlewares: [] },
    },
  ],
};
