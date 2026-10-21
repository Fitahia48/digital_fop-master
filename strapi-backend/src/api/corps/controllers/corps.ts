/**
 * Extensions du controller corps (endpoints non-CRUD du legacy corps.controller.js).
 *
 * - GET   /api/corps/filter                ?corps=nom
 * - GET   /api/corps/professionnels        → [{ id, nom }]
 * - POST  /api/corps/:documentId/visit
 * - POST  /api/corps/:documentId/telechargement
 * - GET   /api/corps/most-visited
 * - GET   /api/corps/stats                 → daily/monthly/yearly (table corps_stats, D7)
 */
import { factories } from '@strapi/strapi';
import { findOneByRef } from '../../../utils/by-ref';
import { estPeriodeValide, sommeStatistiques } from '../../../utils/analytics';
import { enregistrerConsultation } from '../../../utils/comptage';

// Le front historique appelle ces routes avec l'id numérique du corps.
const findCorpsByDocumentId = (ref: string) => findOneByRef('api::corps.corps', ref);

/** URL d'un média Strapi (objet populate) ou valeur brute (chaîne legacy). */
const mediaUrl = (media: any): string | null => {
  if (!media) return null;
  if (typeof media === 'object') return media.url ?? null;
  return String(media);
};

/** Corps enrichi à la forme legacy (médias en URL, type_nom / type_id). */
const corpsResponse = (c: any) => ({
  ...c,
  fichier: mediaUrl(c.fichier),
  pdf_file: mediaUrl(c.pdf_file),
  type_nom: c.type?.nom ?? null,
  type_id: c.type?.id ?? null,
});

/** Téléverse un éventuel fichier multipart (champ « fichier ») → id média Strapi. */
const uploadCorpsFichier = async (ctx: any): Promise<number | null> => {
  const uploaded = ctx.request?.files?.fichier;
  if (!uploaded) return null;
  const files = Array.isArray(uploaded) ? uploaded : [uploaded];
  const [file] = await strapi.plugin('upload').service('upload').upload({ data: {}, files });
  return file?.id ?? null;
};

export default factories.createCoreController('api::corps.corps', () => ({
  // GET /api/corps/filter?corps=nom
  async filtered(ctx: any) {
    try {
      const { corps } = ctx.query || {};
      const rows = (await strapi.documents('api::corps.corps').findMany({
        filters: corps ? { nom: { $eq: corps } } : {},
        limit: -1,
      })) as any[];
      ctx.body = rows;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/corps/professionnels
  async professionnels(ctx: any) {
    try {
      const rows = (await strapi.documents('api::corps.corps').findMany({
        fields: ['nom'],
        limit: -1,
      })) as any[];
      ctx.body = rows.map((r) => ({ id: r.id, nom: r.nom }));
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/corps/:documentId/visit
  // Règle métier : 1 visiteur (empreinte anonyme) = 1 comptage par corps et
  // par jour (jour à Madagascar), unicité garantie par la base
  // (utils/comptage.ts) — les appels répétés ne comptent qu'une fois.
  async incrementVisit(ctx: any) {
    try {
      const corps = await findCorpsByDocumentId(ctx.params.documentId);
      if (!corps) return ctx.notFound('Corps non trouvé');

      const counted = await enregistrerConsultation(ctx, 'corps', Number(corps.id));
      ctx.body = {
        counted,
        message: counted ? 'Visite enregistrée' : 'Visite déjà comptée pour aujourd’hui',
      };
    } catch (err) {
      console.error('incrementCorpsVisit error:', err);
      // Pas d'erreur bloquante pour l'usager côté comptage.
      ctx.body = { counted: false, message: 'Visite non comptée' };
    }
  },

  // POST /api/corps/:documentId/telechargement
  async incrementTelechargement(ctx: any) {
    try {
      const corps = await findCorpsByDocumentId(ctx.params.documentId);
      if (!corps) return ctx.notFound('Corps non trouvé');
      await strapi.documents('api::corps.corps').update({
        documentId: corps.documentId,
        data: { telechargements: (corps.telechargements || 0) + 1 },
      });
      ctx.body = { message: 'Téléchargement enregistré' };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/corps/most-visited
  async mostVisited(ctx: any) {
    try {
      ctx.body = await strapi.documents('api::corps.corps').findMany({
        sort: [{ visits: 'desc' }],
        limit: 10,
      });
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/corps-stats/ — volumétrie des corps (legacy : ?nom=)
  async stats(ctx: any) {
    try {
      const { nom } = ctx.query || {};
      if (nom) {
        const count = (await strapi.documents('api::corps.corps').count({
          filters: { nom: { $eq: nom } },
        })) as unknown as number;
        ctx.body = { nom, count };
        return;
      }

      const total = (await strapi.documents('api::corps.corps').count({})) as unknown as number;
      const rows = (await strapi.documents('api::corps.corps').findMany({
        fields: ['nom'],
        limit: -1,
      })) as any[];

      const byNom = new Map<string, number>();
      for (const r of rows) byNom.set(r.nom, (byNom.get(r.nom) || 0) + 1);

      ctx.body = {
        total_corps: total,
        corps_by_nom: Array.from(byNom.entries())
          .map(([nom, count]) => ({ nom, count }))
          .sort((a, b) => a.nom.localeCompare(b.nom)),
      };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // PATCH /api/corps/:documentId/update_status/ (admin) — statut actif/inactif
  async updateStatus(ctx: any) {
    try {
      const { status } = ctx.request.body || {};
      if (!['actif', 'inactif'].includes(status)) {
        return ctx.badRequest('Statut invalide.');
      }

      const corps = await findCorpsByDocumentId(ctx.params.documentId);
      if (!corps) return ctx.notFound('Corps non trouvé.');

      await strapi.documents('api::corps.corps').update({
        documentId: corps.documentId,
        data: { status },
      });
      ctx.body = { message: 'Statut mis à jour avec succès.' };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // GET /api/corps-stats1/?period=daily|monthly|yearly (+ start_date/end_date) — admin
  async statsApi(ctx: any) {
    try {
      const { period = 'daily', start_date, end_date } = ctx.query || {};
      if (!estPeriodeValide(period)) {
        return ctx.badRequest("Période invalide. Utilisez 'daily', 'monthly' ou 'yearly'.");
      }
      const total = await sommeStatistiques('corps_stats', period, start_date, end_date);

      ctx.body = {
        daily_count: period === 'daily' ? total : 0,
        monthly_count: period === 'monthly' ? total : 0,
        yearly_count: period === 'yearly' ? total : 0,
      };
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // ─── CRUD legacy `/api/corps/...` (le core expose `/organismes`) ────────────

  // GET /api/corps/:documentId/
  async findOne(ctx: any) {
    try {
      const c = await findOneByRef('api::corps.corps', ctx.params.documentId ?? ctx.params.id, [
        'type',
        'fichier',
        'pdf_file',
      ]);
      if (!c) return ctx.notFound('Corps non trouvé.');
      ctx.body = corpsResponse(c);
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },

  // POST /api/corps/ (multipart, admin)
  async create(ctx: any) {
    try {
      const b = ctx.request.body || {};
      const typeRef = b.type ?? b.type_id;
      const data: Record<string, any> = {
        nom: b.nom ?? null,
        numero: b.numero,
        description: b.description,
        date_creation: b.date_creation || null,
        status: b.status || 'actif',
      };
      if (typeRef) data.type = Number(typeRef);

      const fileId = await uploadCorpsFichier(ctx);
      if (fileId) data.fichier = fileId;

      const created = await strapi.documents('api::corps.corps').create({
        data: data as any,
        populate: ['type', 'fichier', 'pdf_file'],
      });
      ctx.status = 201;
      ctx.body = corpsResponse(created);
    } catch (err) {
      return ctx.badRequest((err as Error).message);
    }
  },

  // PUT/PATCH /api/corps/:documentId/ (multipart ou JSON, admin)
  async update(ctx: any) {
    try {
      const current = await findOneByRef('api::corps.corps', ctx.params.documentId ?? ctx.params.id, [
        'type',
        'fichier',
        'pdf_file',
      ]);
      if (!current) return ctx.notFound('Corps non trouvé.');

      const b = ctx.request.body || {};
      const typeRef = b.type ?? b.type_id;
      const data: Record<string, any> = {
        nom: b.nom || current.nom,
        numero: b.numero || current.numero,
        description: b.description || current.description,
        date_creation: b.date_creation || current.date_creation,
        status: b.status || current.status,
      };
      if (typeRef) data.type = Number(typeRef);
      else if (current.type?.id) data.type = current.type.id;

      const fileId = await uploadCorpsFichier(ctx);
      if (fileId) data.fichier = fileId;

      await strapi.documents('api::corps.corps').update({
        documentId: current.documentId,
        data: data as any,
      });
      const fresh =
        (await findOneByRef('api::corps.corps', current.id, ['type', 'fichier', 'pdf_file'])) ??
        current;
      ctx.body = corpsResponse(fresh);
    } catch (err) {
      return ctx.badRequest((err as Error).message);
    }
  },

  // DELETE /api/corps/:documentId/ (admin)
  async delete(ctx: any) {
    try {
      const current = await findOneByRef('api::corps.corps', ctx.params.documentId ?? ctx.params.id);
      if (!current) return ctx.notFound('Corps non trouvé.');
      await strapi.documents('api::corps.corps').delete({ documentId: current.documentId });
      ctx.status = 204;
    } catch (err) {
      return ctx.internalServerError((err as Error).message);
    }
  },
}));
