/**
 * Routes du module d'auth compat — mêmes URLs que backend/src/routes/auth.routes.js.
 *
 * Toutes publiques (auth: false) : le contrôle d'accès est fait dans le contrôleur
 * (login par mot de passe, /users/me résout le Bearer ou le refresh du body).
 *
 * L'INSCRIPTION PUBLIQUE est une DEMANDE de compte : POST /v1/auth/users et
 * /v1/auth/users/ créent un compte au statut « en_attente » (nom, prénom,
 * e-mail, mot de passe). Il ne peut pas se connecter avant confirmation par un
 * super-administrateur. La route U&P native /api/auth/local/register reste
 * refusée (allow_register = false posé au démarrage, cf. src/index.ts).
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
      path: '/v1/auth/users/',
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
      path: '/v1/auth/users/activation/',
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
