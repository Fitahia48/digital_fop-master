/**
 * Routes custom remark.
 * `POST /send-response` est l'URL appelée par le front admin (AdminRemarks.jsx).
 * La variante `/remarks/send-response` est conservée pour la lisibilité REST.
 * Réservé à l'administrateur (aucune donnée personnelle exposée publiquement).
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/send-response',
      handler: 'remark.sendResponse',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'POST',
      path: '/remarks/send-response',
      handler: 'remark.sendResponse',
      config: { policies: [], middlewares: [] }, // admin
    },
  ],
};
