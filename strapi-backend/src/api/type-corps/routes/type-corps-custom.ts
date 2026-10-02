/**
 * Routes custom type-corps (URLs legacy `/api/typecorps/`).
 *
 * Le pluriel core est `types-corps` ; le front historique appelle `typecorps`
 * (AjoutCorps.jsx, EditCorpsForm.jsx, CorpsFilteredList.jsx). Les handlers
 * core sont réutilisés → aucune action/permission supplémentaire.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/typecorps',
      handler: 'type-corps.find',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/typecorps/:documentId',
      handler: 'type-corps.findOne',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/typecorps',
      handler: 'type-corps.create',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'DELETE',
      path: '/typecorps/:documentId',
      handler: 'type-corps.delete',
      config: { policies: [], middlewares: [] }, // admin
    },
  ],
};
