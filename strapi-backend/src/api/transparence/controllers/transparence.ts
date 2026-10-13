/**
 * Transparence — statistiques de CONSULTATION des textes réglementaires.
 *
 * GET /api/transparence/stats — PUBLIC, aucune authentification.
 *
 * Avant la suppression des démarches en ligne, ce controller agrégeait les
 * délais de traitement des démarches (content-types supprimés). Il expose
 * désormais l'usage de la bibliothèque, à partir des compteurs EXISTANTS sur
 * `api::document.document` :
 *
 *   - `visits`          : incrémenté par POST /api/documents/:id/visit
 *   - `telechargements` : incrémenté par POST /api/documents/:id/telechargement
 *   - `type`            : nature du texte (loi, décret, arrêté…)
 *
 * Aucune métrique n'est inventée :
 *  - les compteurs sont CUMULÉS (aucun horodatage par document) → pas de
 *    découpage par période ni d'historique mensuel : `periode = 'cumul'` ;
 *  - le classement des téléchargements est calculé ici (il n'existait aucun
 *    endpoint « most-downloaded ») ;
 *  - aucune donnée personnelle n'est exposée : ni IP, ni user-agent, ni
 *    identifiant de session (la table analytique `visits` — qui contient des
 *    IP — n'est jamais lue ici).
 */
const UID = 'api::document.document';

interface LigneDocument {
  type?: string | null;
  numero?: string | null;
  objet?: string | null;
  visits?: number | null;
  telechargements?: number | null;
}

interface LigneClassement {
  type: string | null;
  numero: string | null;
  objet: string | null;
  consultations: number;
  telechargements: number;
}

interface LigneParType {
  type: string;
  nombre: number;
  consultations: number;
  telechargements: number;
}

const TOP_LIMITE = 10;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Libellé de type : repli lisible plutôt qu'une valeur vide. */
const typeLabel = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : 'non_classee');

/**
 * Agrégat vide (dégradation gracieuse) : la page publique doit rester
 * consultable plutôt que renvoyer une erreur.
 */
const payloadVide = () => ({
  periode: 'cumul' as const,
  periode_jours: null,
  documents_total: 0,
  total_consultations: 0,
  total_telechargements: 0,
  documents_consultes: 0,
  documents_telecharges: 0,
  top_consultes: [] as LigneClassement[],
  top_telecharges: [] as LigneClassement[],
  par_type: [] as LigneParType[],
  indisponible: true,
  maj_le: new Date().toISOString(),
});

// ─── GET /api/transparence/stats ────────────────────────────────────────────

export const getStatsPubliques = async (ctx: any) => {
  try {
    // Seules les notices « validées » sont publiques (même filtre que la
    // liste de documents côté visiteur anonyme).
    const rows = (await strapi.documents(UID).findMany({
      filters: { etat_notice: 'validee' },
      fields: ['type', 'numero', 'objet', 'visits', 'telechargements'],
      limit: -1,
    })) as LigneDocument[];

    let totalConsultations = 0;
    let totalTelechargements = 0;
    let documentsConsultes = 0;
    let documentsTelecharges = 0;

    const parTypeMap = new Map<string, LigneParType>();

    for (const d of rows) {
      const v = num(d.visits);
      const t = num(d.telechargements);

      totalConsultations += v;
      totalTelechargements += t;
      if (v > 0) documentsConsultes += 1;
      if (t > 0) documentsTelecharges += 1;

      const cle = typeLabel(d.type);
      let ligne = parTypeMap.get(cle);
      if (!ligne) {
        ligne = { type: cle, nombre: 0, consultations: 0, telechargements: 0 };
        parTypeMap.set(cle, ligne);
      }
      ligne.nombre += 1;
      ligne.consultations += v;
      ligne.telechargements += t;
    }

    const versLigne = (d: LigneDocument): LigneClassement => ({
      type: d.type ?? null,
      numero: d.numero ?? null,
      objet: d.objet ?? null,
      consultations: num(d.visits),
      telechargements: num(d.telechargements),
    });

    const topConsultes = rows
      .filter((d) => num(d.visits) > 0)
      .sort((a, b) => num(b.visits) - num(a.visits))
      .slice(0, TOP_LIMITE)
      .map(versLigne);

    const topTelecharges = rows
      .filter((d) => num(d.telechargements) > 0)
      .sort((a, b) => num(b.telechargements) - num(a.telechargements))
      .slice(0, TOP_LIMITE)
      .map(versLigne);

    const parType = Array.from(parTypeMap.values()).sort((a, b) => b.nombre - a.nombre);

    ctx.body = {
      periode: 'cumul',
      periode_jours: null,
      documents_total: rows.length,
      total_consultations: totalConsultations,
      total_telechargements: totalTelechargements,
      documents_consultes: documentsConsultes,
      documents_telecharges: documentsTelecharges,
      top_consultes: topConsultes,
      top_telecharges: topTelecharges,
      par_type: parType,
      indisponible: false,
      maj_le: new Date().toISOString(),
    };
  } catch (err) {
    console.error('getStatsPubliques error:', err);
    // Dégradation gracieuse : la page publique reste consultable
    ctx.body = payloadVide();
  }
};

// Strapi n'enregistre un contrôleur que s'il expose un export `default`.
export default { getStatsPubliques };
