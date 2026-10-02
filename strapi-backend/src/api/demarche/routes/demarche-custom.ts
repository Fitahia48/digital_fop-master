/**
 * Routes custom demarche (ownership + admin), aux URLs legacy.
 * - GET   /demarches/mine/                       : démarches de l'usager connecté.
 * - GET   /demarches/:documentId/timeline/       : suivi (propriétaire ou admin).
 * - PATCH /demarches/:documentId/status/          : mise à jour du statut (admin).
 * - GET   /demarches/:documentId/accuse-reception : PDF (propriétaire ou admin).
 * - GET   /demarches/:documentId/pieces/:pieceId  : pièce jointe privée (propriétaire ou admin).
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/demarches/mine',
      handler: 'demarche.mine',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/demarches/:documentId/timeline',
      handler: 'demarche.timeline',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/demarches/:documentId/status',
      handler: 'demarche.updateStatus',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/demarches/:documentId/accuse-reception',
      handler: 'demarche.accuseReception',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/demarches/:documentId/pieces/:pieceId',
      handler: 'demarche.pieceJointe',
      config: { policies: [], middlewares: [] },
    },
  ],
};
