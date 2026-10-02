/**
 * Extensions du controller favori (portage de favoris.controller.js).
 *
 * Routes legacy (aucune adaptation front nécessaire) :
 * - POST   /api/favoris/            { document_id } — ajoute aux favoris (idempotent)
 * - GET    /api/favoris/            — favoris de l'usager connecté (infos documents)
 * - DELETE /api/favoris/:documentId/ — retire un document des favoris
 *
 * Les réponses conservent la forme legacy (`{ count, results }`, snake_case,
 * ids numériques, `created_at`) afin que `MesFavoris.jsx` fonctionne tel quel.
 */
import { factories } from '@strapi/strapi';
import { ValidationError, getRequestUser } from '../../../utils/errors';
import { findOneByRef } from '../../../utils/by-ref';

/** URL d'un média Strapi (objet) ou valeur brute (chaîne legacy). */
const mediaUrl = (media: any): string | null => {
  if (!media) return null;
  if (typeof media === 'object') return media.url ?? null;
  return String(media);
};

/** Résout un document par id numérique ou par documentId (Strapi 5). */
const resolveDocument = (key: string | number) => findOneByRef('api::document.document', key);

/** Ligne de favori aplatie au format legacy (document + favori). */
const flattenFavori = (favori: any) => {
  const doc = favori.document || {};
  return {
    favori_id: favori.id,
    favori_created_at: favori.createdAt,
    id: doc.id,
    type: doc.type ?? null,
    objet: doc.objet ?? null,
    numero: doc.numero ?? null,
    date: doc.date ?? null,
    status: doc.status ?? null,
    fichier: mediaUrl(doc.fichier),
    pdf_file: mediaUrl(doc.pdf_file),
    visits: doc.visits ?? 0,
    telechargements: doc.telechargements ?? 0,
    domaine_nom: doc.domaine?.nom ?? null,
  };
};

export default factories.createCoreController('api::favori.favori', () => ({
  // POST /api/favoris/ — ajouter un document aux favoris
  async addFavori(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    try {
      const { document_id, document } = ctx.request.body || {};
      const key = document_id ?? document;
      if (!key) {
        throw new ValidationError('Identifiant du document manquant.');
      }

      const doc = await resolveDocument(key);
      if (!doc) {
        return ctx.notFound('Document introuvable.');
      }

      // Déjà en favori ? Idempotent : on confirme sans dupliquer
      const existing = (await strapi.documents('api::favori.favori').findMany({
        filters: { user: { id: user.id }, document: { id: doc.id } },
        limit: 1,
      })) as any[];

      if (existing.length > 0) {
        ctx.status = 200;
        ctx.body = { detail: 'Ce document est déjà dans vos favoris.', favori: true };
        return;
      }

      await strapi.documents('api::favori.favori').create({
        data: { user: user.id, document: doc.id },
      });

      ctx.status = 201;
      ctx.body = { detail: 'Document ajouté à vos favoris.', favori: true };
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('addFavori error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // GET /api/favoris/ — favoris de l'usager connecté (infos documents)
  async myFavoris(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    try {
      const rows = (await strapi.documents('api::favori.favori').findMany({
        filters: { user: { id: user.id } },
        populate: ['document', 'document.domaine'],
        sort: [{ createdAt: 'desc' }],
        limit: -1,
      })) as any[];

      const results = rows.map(flattenFavori);
      ctx.body = { count: results.length, results };
    } catch (err) {
      console.error('myFavoris error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // DELETE /api/favoris/:documentId/ — retirer un document des favoris
  async removeFavori(ctx: any) {
    const user = getRequestUser(ctx);
    if (!user) return ctx.unauthorized();

    try {
      const doc = await resolveDocument(ctx.params.documentId);
      if (!doc) {
        return ctx.notFound("Ce document n'est pas dans vos favoris.");
      }

      const rows = (await strapi.documents('api::favori.favori').findMany({
        filters: { user: { id: user.id }, document: { id: doc.id } },
        limit: 1,
      })) as any[];

      if (rows.length === 0) {
        return ctx.notFound("Ce document n'est pas dans vos favoris.");
      }

      await strapi.documents('api::favori.favori').delete({
        documentId: rows[0].documentId,
      });

      ctx.body = { detail: 'Document retiré de vos favoris.', favori: false };
    } catch (err) {
      console.error('removeFavori error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },
}));
