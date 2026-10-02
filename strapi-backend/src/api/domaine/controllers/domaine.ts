/**
 * Controller domaine — forme de réponse legacy.
 *
 * Portage de `getDomaines` / `createDomaine` / `deleteDomaine` de
 * backend/src/controllers/documents.controller.js.
 *
 * Le front historique (Menu.jsx, SearchBar.jsx, AddDocs.jsx, EditDoc.jsx)
 * appelle `GET /api/domaines/` et lit `response.data.results` : on surcharge
 * donc `find` (au lieu de l'enveloppe core Strapi `{ data, meta }`).
 *
 * Les routes et handlers core (`/domaines`) sont conservés à l'identique, donc
 * les permissions déjà attribuées (Public : find/findOne ; Administrateur : tout)
 * restent valides — aucune route custom n'est ajoutée.
 */
import { factories } from '@strapi/strapi';
import { findOneByRef } from '../../../utils/by-ref';

const UID = 'api::domaine.domaine';

export default factories.createCoreController(UID, () => ({
  // GET /api/domaines/
  async find(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        sort: [{ id: 'desc' }],
        limit: -1,
      })) as any[];
      ctx.body = { count: rows.length, results: rows };
    } catch (err) {
      console.error('[domaine] find:', (err as Error).message);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/domaines/:id/
  async findOne(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.id);
      if (!row) return ctx.notFound('Domaine non trouvé.');
      ctx.body = row;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/domaines/ (admin)
  async create(ctx: any) {
    try {
      const { nom } = ctx.request.body || {};
      if (!nom || !String(nom).trim()) {
        return ctx.badRequest('Le nom du domaine est obligatoire.');
      }
      const created = await strapi.documents(UID).create({
        data: { nom: String(nom).trim() },
      });
      ctx.status = 201;
      ctx.body = created;
    } catch (err) {
      return ctx.badRequest((err as Error).message);
    }
  },

  // DELETE /api/domaines/:id/ (admin)
  async delete(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.id);
      if (!row) return ctx.notFound('Domaine non trouvé.');
      await strapi.documents(UID).delete({ documentId: row.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
