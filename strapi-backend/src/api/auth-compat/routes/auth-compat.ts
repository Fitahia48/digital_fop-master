/**
 * Routes du module d'auth compat — mêmes URLs que backend/src/routes/auth.routes.js.
 *
 * Toutes publiques (auth: false) : le contrôle d'accès est fait dans le contrôleur
 * (login par mot de passe, /users/me résout le Bearer ou le refresh du body).
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/v1/auth/jwt/create',
      handler: 'auth-compat.login',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/auth/jwt/refresh',
      handler: 'auth-compat.refresh',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/auth/logout',
      handler: 'auth-compat.logout',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/v1/auth/users/me',
      handler: 'auth-compat.me',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/auth/users',
      handler: 'auth-compat.register',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/auth/users/activation',
      handler: 'auth-compat.activate',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/auth/users/reset_password',
      handler: 'auth-compat.resetPassword',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/v1/auth/users/reset_password_confirm',
      handler: 'auth-compat.resetPasswordConfirm',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
