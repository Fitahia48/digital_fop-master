/**
 * Extensions du controller remark.
 * POST /api/remarks/send-response — l'admin répond par email à une remarque.
 */
import { factories } from '@strapi/strapi';
import { sendRemarkResponseEmail } from '../../../utils/mailer';
import { resolveLang } from '../../../utils/email-templates';
import { ValidationError } from '../../../utils/errors';
import { findOneByRef } from '../../../utils/by-ref';

const UID = 'api::remark.remark';

export default factories.createCoreController(UID, () => ({
  // GET /api/remarks/ (admin) — forme legacy {count, results}
  async find(ctx: any) {
    try {
      const rows = (await strapi.documents(UID).findMany({
        sort: [{ createdAt: 'desc' }],
        limit: -1,
      })) as any[];
      ctx.body = { count: rows.length, results: rows };
    } catch (err) {
      console.error('[remark] find:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // POST /api/remarks/ (public) — dépôt d'une remarque
  async create(ctx: any) {
    try {
      const { email, message } = ctx.request.body || {};
      const created = await strapi.documents(UID).create({
        data: { email: String(email ?? '').trim(), message: String(message ?? '').trim() } as any,
      });
      ctx.status = 201;
      ctx.body = created;
    } catch (err) {
      return ctx.badRequest((err as Error).message);
    }
  },

  // DELETE /api/remarks/:id/ (admin)
  async delete(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.id ?? ctx.params.documentId);
      if (!row) return ctx.notFound('Remarque non trouvée.');
      await strapi.documents(UID).delete({ documentId: row.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  async sendResponse(ctx: any) {
    try {
      const { email, response } = ctx.request.body || {};
      if (!email || !String(response || '').trim()) {
        throw new ValidationError('Email et réponse sont obligatoires.');
      }
      sendRemarkResponseEmail(String(email), String(response), resolveLang(null)).catch((err) =>
        console.error('send-response mailer error:', (err as Error).message)
      );
      ctx.body = { detail: 'Réponse envoyée.' };
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
