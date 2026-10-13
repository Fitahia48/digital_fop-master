/**
 * Controller document-relation — forme de réponse legacy.
 *
 * Portage de createDocumentRelation / deleteDocumentRelation de
 * backend/src/controllers/documents.controller.js.
 *
 * - POST   /api/documents/:documentId/relations/  (route custom, admin)
 * - DELETE /api/document-relations/:id/           (route core surchargée)
 *
 * Les handlers core `create` / `delete` sont réutilisés (mêmes actions →
 * permissions inchangées : Public find/findOne, Administrateur tout).
 */
import { factories } from '@strapi/strapi';
import { ValidationError } from '../../../utils/errors';
import { findOneByRef } from '../../../utils/by-ref';

const UID = 'api::document-relation.document-relation';
const DOCS_UID = 'api::document.document';
const ALLOWED_TYPES = ['modifie', 'abroge', 'complete', 'vise'];

export default factories.createCoreController(UID, () => ({
  // POST /api/documents/:documentId/relations/ (admin)
  async create(ctx: any) {
    try {
      const b = ctx.request.body || {};
      const sourceRef = ctx.params?.documentId ?? b.document_source_id ?? b.document_source;
      const cibleRef = b.document_cible_id ?? b.document_cible;
      const { type_relation } = b;

      if (!cibleRef || !type_relation) {
        throw new ValidationError('document_cible_id et type_relation sont obligatoires.');
      }
      if (!ALLOWED_TYPES.includes(type_relation)) {
        throw new ValidationError(
          'type_relation invalide. Valeurs autorisées : modifie, abroge, complete, vise.'
        );
      }

      const [source, cible] = await Promise.all([
        findOneByRef(DOCS_UID, sourceRef),
        findOneByRef(DOCS_UID, cibleRef),
      ]);
      if (!source || !cible) {
        return ctx.notFound("L'un des deux documents n'existe pas.");
      }
      if (source.id === cible.id) {
        throw new ValidationError("Un document ne peut pas avoir de relation avec lui-même.");
      }

      // Idempotence : la contrainte SQL legacy UNIQUE(source, cible, type)
      // n'est pas exprimable en schema.json Strapi → garde-fou ici.
      const existing = (await strapi.documents(UID).findMany({
        filters: {
          document_source: { id: source.id },
          document_cible: { id: cible.id },
          type_relation,
        } as any,
        limit: 1,
      })) as any[];
      if (existing.length > 0) {
        ctx.status = 409;
        ctx.body = { detail: 'Cette relation existe déjà entre ces deux documents.' };
        return;
      }

      const created = await strapi.documents(UID).create({
        data: {
          document_source: source.id,
          document_cible: cible.id,
          type_relation,
        } as any,
      });
      ctx.status = 201;
      ctx.body = created;
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('[document-relation] create:', (err as Error).message);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // DELETE /api/document-relations/:id/ (admin)
  async delete(ctx: any) {
    try {
      const relation = await findOneByRef(UID, ctx.params.id);
      if (!relation) return ctx.notFound('Relation non trouvée.');
      await strapi.documents(UID).delete({ documentId: relation.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
