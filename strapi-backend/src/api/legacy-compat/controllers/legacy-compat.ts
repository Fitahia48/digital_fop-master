/**
 * Contrôleur du module `legacy-compat` — forme legacy `{count, results}` pour
 * les chemins sans collision avec le core.
 *
 * Portage de :
 *   - GET /api/corps/         (corps.controller.js → getCorps)
 *   - GET /api/organigramme/  (organigramme.controller.js)
 *
 * Les CRUD documents/actualités/domaines/… sont portés par les controllers de
 * leurs propres modules (qui surchargent les handlers core, seules routes
 * effectivement résolues).
 */
const CORPS_UID = 'api::corps.corps';
const ORG_UID = 'api::organigramme.organigramme';

/** URL absolue d'un média Strapi (objet populate) ou valeur brute (chaîne legacy). */
const mediaUrl = (media: any): string | null => {
  if (!media) return null;
  if (typeof media === 'object') return media.url ?? null;
  return String(media);
};

const parsePagination = (query: any) => {
  const page = Math.max(1, parseInt(query?.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query?.page_size, 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

export default {
  // ─── GET /api/corps/ ────────────────────────────────────────────────────────
  async listCorps(ctx: any) {
    try {
      const q = ctx.request.query || {};
      const { pageSize, offset } = parsePagination(q);

      const filters: Record<string, any> = {};
      if (q.search?.trim()) {
        filters.$or = [
          { nom: { $containsi: q.search.trim() } },
          { numero: { $containsi: q.search.trim() } },
          { description: { $containsi: q.search.trim() } },
        ];
      }

      const total = (await strapi.documents(CORPS_UID).count({ filters })) as unknown as number;
      const rows = (await strapi.documents(CORPS_UID).findMany({
        filters,
        populate: ['type', 'fichier', 'pdf_file'],
        limit: pageSize,
        offset,
        sort: [{ id: 'desc' }],
      })) as any[];

      ctx.body = {
        count: total,
        results: rows.map((c: any) => ({
          ...c,
          fichier: mediaUrl(c.fichier),
          pdf_file: mediaUrl(c.pdf_file),
          type_nom: c.type?.nom ?? null,
          type_id: c.type?.id ?? null,
        })),
      };
    } catch (err: any) {
      console.error('[legacy-compat] listCorps:', err.message);
      ctx.status = 500;
      ctx.body = { detail: err.message };
    }
  },

  // ─── GET /api/organigramme/ (forme legacy {count, results, grouped}) ───────
  async listOrganigramme(ctx: any) {
    try {
      const rows = (await strapi.documents(ORG_UID).findMany({
        filters: { actif: true },
        limit: -1,
      })) as any[];

      const grouped: Record<string, any[]> = {};
      for (const item of rows) {
        const service = item.service || 'Autres';
        if (!grouped[service]) grouped[service] = [];
        grouped[service].push(item);
      }
      ctx.body = { count: rows.length, results: rows, grouped };
    } catch (err: any) {
      console.error('[legacy-compat] listOrganigramme:', err.message);
      ctx.status = 500;
      ctx.body = { detail: err.message };
    }
  },
};
