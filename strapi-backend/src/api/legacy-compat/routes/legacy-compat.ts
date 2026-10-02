/**
 * Module `legacy-compat` — URLs legacy dont la forme de réponse diffère du core
 * (`{count, results}` au lieu de `{data, meta}`) et dont le chemin est distinct
 * de toute route core.
 *
 * ⚠️ Les routes `/documents` ont été retirées de ce module : leur chemin
 * coïncidait avec la route core et, l'ordre de chargement des APIs étant
 * alphabétique (`document` < `legacy-compat`), le core les masquait. La forme
 * legacy des documents est désormais portée directement par le controller
 * `api::document.document` (voir api/document/controllers/document.ts).
 *
 * Restent ici uniquement les chemins sans collision :
 *  - `/corps`        (le core expose le pluriel `organismes`)
 *  - `/organigramme` (le core expose le pluriel `organigrammes`)
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/corps',
      handler: 'legacy-compat.listCorps',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/organigramme',
      handler: 'legacy-compat.listOrganigramme',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
