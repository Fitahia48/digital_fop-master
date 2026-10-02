/**
 * Route custom document-relation.
 *
 * `POST /api/documents/:documentId/relations/` est l'URL appelée par
 * DocumentLifecycleModal.jsx pour lier deux textes (modifie / abroge / complète).
 *
 * Elle est déclarée dans ce module (et pas dans `document`) afin de réutiliser
 * le handler core `document-relation.create` — donc l'action déjà attribuée au
 * rôle Administrateur, sans script de permissions supplémentaire.
 * Le chemin `/documents/:documentId/relations` n'entre en collision avec aucune
 * route core.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/documents/:documentId/relations',
      handler: 'document-relation.create',
      config: { policies: [], middlewares: [] }, // admin
    },
  ],
};
