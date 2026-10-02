/**
 * Transparence (portage de backend/src/controllers/transparence.controller.js).
 *
 * GET /api/transparence/stats — PUBLIC, aucune authentification.
 * N'expose QUE des données agrégées et anonymisées via le Document Service API :
 * ni user_id, ni email, ni objet, ni identifiant de démarche.
 */
import { ApplicationError } from '../../../utils/errors';

// ─── Configuration ──────────────────────────────────────────────────────────
// Délai réglementaire de référence (jours), configurable sans redéploiement.
export const DELAI_REGLEMENTAIRE_JOURS =
  parseInt(process.env.DEMARCHE_DELAI_REGLEMENTAIRE_JOURS || '', 10) || 30;

// Découpage temporel exposé publiquement
const PERIODES: Record<string, number> = {
  mois: 30,
  trimestre: 90,
  annee: 365,
};

const resolvePeriode = (periode?: string) => (PERIODES[periode || ''] ? (periode as string) : 'annee');

// Statuts du cycle de vie d'une démarche (repris de la migration 005)
const STATUTS = ['soumise', 'en_cours', 'traitee', 'rejetee'];

const round1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/**
 * Agrégat vide (dégradation gracieuse) : la page publique doit rester
 * consultable plutôt que renvoyer une erreur.
 */
const payloadVide = (periode: string, jours: number) => ({
  periode,
  periode_jours: jours,
  delai_reglementaire_jours: DELAI_REGLEMENTAIRE_JOURS,
  total_demarches: 0,
  total_traitees: 0,
  delai_moyen_global_jours: null,
  taux_respect_delai_global: null,
  par_statut: STATUTS.map((statut) => ({ statut, nombre: 0 })),
  par_type: [] as any[],
  indisponible: true,
  maj_le: new Date().toISOString(),
});

interface LigneParType {
  type_demarche: string;
  nombre: number;
  traitees: number;
  dans_delai: number;
  delai_moyen_jours: number | null;
  taux_respect_delai: number | null;
}

// ─── GET /api/transparence/stats ────────────────────────────────────────────

export const getStatsPubliques = async (ctx: any) => {
  const periode = resolvePeriode(ctx.query?.periode);
  const jours = PERIODES[periode];

  try {
    const since = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

    // 1. Démarches de la fenêtre (Document Service API)
    const demarches = (await strapi.documents('api::demarche.demarche').findMany({
      filters: { createdAt: { $gte: since.toISOString() } },
      limit: -1,
    })) as any[];

    // 2. Journal (timeline) de ces démarches : « clôturée » = première entrée
    //    en statut final (traitée/rejetée), garantie horodatée et non modifiable
    //    (journal append-only).
    const demarcheIds = demarches.map((d) => d.documentId);
    const timeline = demarcheIds.length
      ? ((await strapi.documents('api::demarche-timeline.demarche-timeline').findMany({
          filters: { demarche: { documentId: { $in: demarcheIds } } },
          sort: [{ createdAt: 'asc' }],
          limit: -1,
        })) as any[])
      : [];

    // Première clôture par démarche
    const clotureLe = new Map<string, Date>();
    for (const t of timeline) {
      if (t.statut === 'traitee' || t.statut === 'rejetee') {
        const key = t.demarche?.documentId;
        if (key && !clotureLe.has(key)) clotureLe.set(key, new Date(t.createdAt));
      }
    }

    // 3. Volumétrie par statut (tous les statuts présents dans la réponse, 0 si absent)
    const parStatutMap: Record<string, number> = {};
    for (const d of demarches) {
      parStatutMap[d.statut] = (parStatutMap[d.statut] || 0) + 1;
    }

    // 4. Volumétrie + délais par type de démarche
    const parTypeMap = new Map<string, LigneParType>();
    for (const d of demarches) {
      let ligne = parTypeMap.get(d.type_demarche);
      if (!ligne) {
        ligne = {
          type_demarche: d.type_demarche,
          nombre: 0,
          traitees: 0,
          dans_delai: 0,
          delai_moyen_jours: null,
          taux_respect_delai: null,
        };
        parTypeMap.set(d.type_demarche, ligne);
      }
      ligne.nombre += 1;

      const cloture = clotureLe.get(d.documentId);
      if (cloture) {
        ligne.traitees += 1;
        const delaiJours = (cloture.getTime() - new Date(d.createdAt).getTime()) / 86400000;
        if (delaiJours <= DELAI_REGLEMENTAIRE_JOURS) ligne.dans_delai += 1;
      }
    }

    const parType = Array.from(parTypeMap.values()).map((l) => {
      const delais: number[] = [];
      // Recalcul de la moyenne pondérée : on agrège à la volée
      return l;
    });

    // Délai moyen par type : moyenne des délais de clôture
    const delaisParType = new Map<string, number[]>();
    for (const d of demarches) {
      const cloture = clotureLe.get(d.documentId);
      if (cloture) {
        const delaiJours = (cloture.getTime() - new Date(d.createdAt).getTime()) / 86400000;
        const arr = delaisParType.get(d.type_demarche) || [];
        arr.push(delaiJours);
        delaisParType.set(d.type_demarche, arr);
      }
    }
    for (const l of parType) {
      const arr = delaisParType.get(l.type_demarche) || [];
      l.delai_moyen_jours = arr.length > 0 ? round1(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
      l.taux_respect_delai = l.traitees > 0 ? round1((l.dans_delai / l.traitees) * 100) : null;
    }
    parType.sort((a, b) => b.nombre - a.nombre);

    // 5. Agrégats globaux dérivés des lignes par type
    const totalDemarches = parType.reduce((s, l) => s + l.nombre, 0);
    const totalTraitees = parType.reduce((s, l) => s + l.traitees, 0);
    const totalDansDelai = parType.reduce((s, l) => s + l.dans_delai, 0);

    // Moyenne pondérée par le nombre de démarches clôturées de chaque type
    const delaiMoyenGlobal =
      totalTraitees > 0
        ? round1(
            parType.reduce((s, l) => s + (l.delai_moyen_jours || 0) * l.traitees, 0) / totalTraitees
          )
        : null;

    const tauxGlobal = totalTraitees > 0 ? round1((totalDansDelai / totalTraitees) * 100) : null;

    ctx.body = {
      periode,
      periode_jours: jours,
      delai_reglementaire_jours: DELAI_REGLEMENTAIRE_JOURS,
      total_demarches: totalDemarches,
      total_traitees: totalTraitees,
      delai_moyen_global_jours: delaiMoyenGlobal,
      taux_respect_delai_global: tauxGlobal,
      par_statut: STATUTS.map((statut) => ({ statut, nombre: parStatutMap[statut] || 0 })),
      par_type: parType,
      indisponible: false,
      maj_le: new Date().toISOString(),
    };
  } catch (err) {
    console.error('getStatsPubliques error:', err);
    // Dégradation gracieuse : la page publique reste consultable
    ctx.body = payloadVide(periode, jours);
  }
};

// Strapi n'enregistre un contrôleur que s'il expose un export `default`.
export default { getStatsPubliques };
