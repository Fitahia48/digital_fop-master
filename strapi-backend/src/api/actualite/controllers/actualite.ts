/**
 * Controller actualite — forme de réponse legacy.
 *
 * Portage de getActualites / getActualite / createActualite / updateActualite /
 * deleteActualite de backend/src/controllers/documents.controller.js.
 *
 * Le front (AfficheActus.jsx, AddActus.jsx) lit `response.data.results` et
 * appelle les URLs avec/sans slash final (`/api/actualites/`, `/api/actualites/:id`).
 * On surcharge donc les handlers core `find`/`findOne`/`create`/`update`/`delete`
 * (mêmes routes, mêmes actions → permissions inchangées).
 */
import { factories } from '@strapi/strapi';
import { findOneByRef } from '../../../utils/by-ref';

const UID = 'api::actualite.actualite';

export default factories.createCoreController(UID, () => ({
  // GET /api/actualites/ (+ ?pk=, ?categorie=, ?search=, ?limit=)
  async find(ctx: any) {
    try {
      const q = ctx.query || {};
      const { pk, categorie, search, limit = 12 } = q;

      // ?pk= : renvoie un tableau (comportement legacy)
      if (pk) {
        const rows = (await strapi.documents(UID).findMany({
          filters: { id: Number(pk) },
          limit: -1,
        })) as any[];
        ctx.body = rows;
        return;
      }

      // Recherche plein texte (utilisée par la recherche groupée du front)
      if (search && String(search).trim()) {
        const lim = Math.min(Math.max(parseInt(String(limit), 10) || 12, 1), 50);
        const rows = (await strapi.documents(UID).findMany({
          filters: {
            $or: [
              { titre: { $containsi: String(search).trim() } },
              { texte: { $containsi: String(search).trim() } },
              { lieu: { $containsi: String(search).trim() } },
            ],
          },
          sort: [{ id: 'desc' }],
          limit: lim,
        } as any)) as any[];
        ctx.body = { count: rows.length, results: rows };
        return;
      }

      // Filtre par catégorie (offre / nouveaute)
      if (categorie && categorie !== 'actualite') {
        const rows = (await strapi.documents(UID).findMany({
          filters: { categorie: String(categorie) } as any,
          sort: [{ id: 'desc' }],
          limit: 12,
        })) as any[];
        ctx.body = { count: rows.length, results: rows };
        return;
      }

      // Comportement historique : 4 derniers Conseils des ministres
      // + 4 derniers Conseils du gouvernement (catégorie « actualite »).
      const [ministre, gouvernement] = await Promise.all([
        strapi.documents(UID).findMany({
          filters: { conseil: 'CONSEIL DES MINISTRES', categorie: 'actualite' } as any,
          sort: [{ id: 'desc' }],
          limit: 4,
        }),
        strapi.documents(UID).findMany({
          filters: { conseil: 'CONSEIL DU GOUVERNEMENT', categorie: 'actualite' } as any,
          sort: [{ id: 'desc' }],
          limit: 4,
        }),
      ]);

      ctx.body = {
        count: (ministre as any[]).length + (gouvernement as any[]).length,
        results: [...(ministre as any[]), ...(gouvernement as any[])],
      };
    } catch (err) {
      console.error('[actualite] find:', (err as Error).message);
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/actualites/:id/
  async findOne(ctx: any) {
    try {
      const row = await findOneByRef(UID, ctx.params.id);
      if (!row) return ctx.notFound('Actualité non trouvée.');
      ctx.body = row;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/actualites/ (admin)
  async create(ctx: any) {
    try {
      const { conseil, titre, date, lieu, texte, categorie } = ctx.request.body || {};
      const created = await strapi.documents(UID).create({
        data: {
          conseil: conseil ?? 'CONSEIL DES MINISTRES',
          titre,
          date: date || null,
          lieu,
          texte,
          categorie: categorie || 'actualite',
        } as any,
      });
      ctx.status = 201;
      ctx.body = created;
    } catch (err) {
      return ctx.badRequest((err as Error).message);
    }
  },

  // PUT/PATCH /api/actualites/:id/ (admin, mise à jour partielle)
  async update(ctx: any) {
    try {
      const current = await findOneByRef(UID, ctx.params.id);
      if (!current) return ctx.notFound('Actualité non trouvée.');

      const b = ctx.request.body || {};
      const data: Record<string, any> = {};
      for (const key of ['conseil', 'titre', 'date', 'lieu', 'texte', 'categorie']) {
        if (b[key] !== undefined) data[key] = b[key];
      }
      if (Object.keys(data).length === 0) {
        return ctx.badRequest('Aucun champ à mettre à jour.');
      }

      const updated = await strapi.documents(UID).update({
        documentId: current.documentId,
        data: data as any,
      });
      ctx.body = updated;
    } catch (err) {
      return ctx.badRequest((err as Error).message);
    }
  },

  // DELETE /api/actualites/:id/ (admin)
  async delete(ctx: any) {
    try {
      const current = await findOneByRef(UID, ctx.params.id);
      if (!current) return ctx.notFound('Actualité non trouvée.');
      await strapi.documents(UID).delete({ documentId: current.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
