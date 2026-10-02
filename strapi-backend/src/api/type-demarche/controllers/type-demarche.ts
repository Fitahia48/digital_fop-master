/**
 * Controller type-demarche — liste publique des types de démarches actifs.
 *
 * GET /api/types-demarche?lang=fr|en|mg
 * Réponse : types actifs avec libellé traduit, pièces requises, champs
 * spécifiques, direction et délai cible (affichés AVANT l'envoi, front).
 * Aucune donnée sensible (le référentiel est public par nature).
 */
export default {
  async listActive(ctx: any) {
    const lang = ['fr', 'en', 'mg'].includes(String(ctx.query?.lang))
      ? String(ctx.query.lang)
      : 'fr';

    const rows = (await strapi.documents('api::type-demarche.type-demarche').findMany({
      filters: { actif: true },
      populate: ['direction'],
      sort: [{ code: 'asc' }],
      limit: -1,
    })) as any[];

    ctx.body = {
      count: rows.length,
      results: rows.map((t: any) => ({
        code: t.code,
        libelle: t.libelles?.[lang] ?? t.libelles?.fr ?? t.code,
        libelles: t.libelles, // utile pour l'affichage trilingue de l'admin front
        direction: t.direction ? { code: t.direction.code, nom: t.direction.nom } : null,
        delai_cible_jours: t.delai_cible_jours,
        pieces_requises: (t.pieces_requises ?? []).map((p: any) => ({
          code: p.code,
          libelle: p.libelles?.[lang] ?? p.libelles?.fr ?? p.code,
          obligatoire: Boolean(p.obligatoire),
        })),
        champs_specifiques: (t.champs_specifiques ?? []).map((c: any) => ({
          code: c.code,
          libelle: c.libelles?.[lang] ?? c.libelles?.fr ?? c.code,
          type: c.type ?? 'string',
          obligatoire: Boolean(c.obligatoire),
        })),
      })),
    };
  },
};
