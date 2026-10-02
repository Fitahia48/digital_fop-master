/**
 * Routes custom faq.
 *
 * Le core expose `/api/faqs` (pluriel) ; le front historique appelle `/api/faq/`
 * et `/api/faq/:id/` (AdminFaq.jsx). Les handlers core sont réutilisés → les
 * actions (Public : find ; Administrateur : create/update/delete) restent les mêmes.
 *
 * `/faq/ask` (public, chatbot) est déclaré en premier.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/faq/ask',
      handler: 'faq.ask',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/faq',
      handler: 'faq.find',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/faq',
      handler: 'faq.create',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'PUT',
      path: '/faq/:documentId',
      handler: 'faq.update',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'PATCH',
      path: '/faq/:documentId',
      handler: 'faq.update',
      config: { policies: [], middlewares: [] }, // admin
    },
    {
      method: 'DELETE',
      path: '/faq/:documentId',
      handler: 'faq.delete',
      config: { policies: [], middlewares: [] }, // admin
    },
  ],
};
