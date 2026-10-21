export default {
  routes: [
    {
      method: 'POST',
      path: '/subscribers/subscribe',
      handler: 'subscriber.subscribe',
      config: { auth: false, policies: [], middlewares: [] },
    },
    // ─── Espace administration (auth requis + contrôle isAdminCtx dans le
    // contrôleur — même pattern que statistics / transparence) ──────────────
    // Aucune permission U&P n'est requise côté Public/Authenticated : le rôle
    // Administrateur reçoit toutes les actions (assign-permissions.ts).
    {
      method: 'GET',
      path: '/subscribers/admin/list',
      handler: 'subscriber.adminList',
      config: { policies: [], middlewares: [] }, // auth requis, admin vérifié dans le contrôleur
    },
    {
      method: 'GET',
      path: '/subscribers/admin/export',
      handler: 'subscriber.adminExport',
      config: { policies: [], middlewares: [] }, // auth requis, admin vérifié dans le contrôleur
    },
    {
      method: 'DELETE',
      path: '/subscribers/admin/:id',
      handler: 'subscriber.adminDelete',
      config: { policies: [], middlewares: [] }, // auth requis, admin vérifié dans le contrôleur
    },
    {
      method: 'GET',
      path: '/subscribers/confirm/:token',
      handler: 'subscriber.confirmSubscription',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/subscribers/unsubscribe/:token',
      handler: 'subscriber.unsubscribe',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
