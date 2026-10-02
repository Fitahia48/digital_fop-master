/**
 * Controller type-corps — forme de réponse legacy.
 *
 * Portage de getTypeCorps / createTypeCorps / deleteTypeCorps
 * (backend/src/controllers/corps.controller.js).
 *
 * Le front appelle `/api/typecorps/` (sans « s » interne), alors que le chemin
 * core est `/api/types-corps` : on expose donc des routes custom
 * (type-corps-custom.ts) qui réutilisent les handlers core `find` / `findOne` /
 * `create` / `delete` (mêmes actions → permissions inchangées).
 */
import { factories } from '@strapi/strapi';
import { findOneByRef } from '../../../utils/by-ref';

const UID = 'api::type-corps.type-corps';

export default factories.createCoreController(UID, () => ({
  // GET /api/typecorps/ (+ /api/types-corps)
  async find(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        sort: [{ id: 'asc' }],
        limit: -1,
      })) as any[];
      ctx.body = { count: rows.length, results: rows };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/typecorps/:documentId/
  async findOne(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.documentId ?? ctx.params.id);
      if (!row) return ctx.notFound('Type de corps non trouvé.');
      ctx.body = row;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/typecorps/ (admin)
  async create(ctx: any) {
    try {
      const { nom } = ctx.request.body || {};
      if (!nom || !String(nom).trim()) {
        return ctx.badRequest('Le nom du type de corps est obligatoire.');
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

  // DELETE /api/typecorps/:documentId/ (admin)
  async delete(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.documentId ?? ctx.params.id);
      if (!row) return ctx.notFound('Type de corps non trouvé.');
      await strapi.documents(UID).delete({ documentId: row.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
