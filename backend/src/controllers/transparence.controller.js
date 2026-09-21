const pool = require('../config/db');

// ─── Configuration ──────────────────────────────────────────────────────────
// Délai réglementaire de référence (jours), configurable sans redéploiement.
const DELAI_REGLEMENTAIRE_JOURS =
  parseInt(process.env.DEMARCHE_DELAI_REGLEMENTAIRE_JOURS, 10) || 30;

// Découpage temporel exposé publiquement
const PERIODES = {
  mois: 30,
  trimestre: 90,
  annee: 365,
};

const resolvePeriode = (periode) => (PERIODES[periode] ? periode : 'annee');

// Statuts du cycle de vie d'une démarche (repris de la migration 005)
const STATUTS = ['soumise', 'en_cours', 'traitee', 'rejetee'];

const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/**
 * Agrégat vide (utilisé si les migrations ne sont pas encore appliquées) :
 * la page publique doit rester consultable plutôt que renvoyer une erreur.
 */
const payloadVide = (periode, jours) => ({
  periode,
  periode_jours: jours,
  delai_reglementaire_jours: DELAI_REGLEMENTAIRE_JOURS,
  total_demarches: 0,
  total_traitees: 0,
  delai_moyen_global_jours: null,
  taux_respect_delai_global: null,
  par_statut: STATUTS.map((statut) => ({ statut, nombre: 0 })),
  par_type: [],
  indisponible: true,
  maj_le: new Date().toISOString(),
});

// ─── GET /api/transparence/stats/ (PUBLIC — aucune authentification) ─────────
//
// Agrège les démarches sur une fenêtre temporelle et n'expose QUE des données
// agrégées : ni user_id, ni email, ni objet, ni identifiant de démarche.
//
// - nombre de démarches par type et par statut
// - délai moyen de traitement (calculé depuis le journal demarche_timeline)
// - taux de démarches traitées dans le délai réglementaire
//
// Paramètre : ?periode=mois|trimestre|annee (défaut : annee)

const getStatsPubliques = async (req, res) => {
  const periode = resolvePeriode(req.query.periode);
  const jours = PERIODES[periode];

  try {
    const since = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

    // 1. Volumétrie par statut
    const statutsResult = await pool.query(
      `SELECT statut, COUNT(*)::int AS nombre
       FROM demarches
       WHERE created_at >= $1::timestamptz
       GROUP BY statut`,
      [since]
    );

    // 2. Volumétrie + délais par type de démarche.
    //    « clôturée » = première entrée de timeline en statut final (traitée/rejetée),
    //    ce qui garantit une mesure horodatée et non modifiable (journal append-only).
    const parTypeResult = await pool.query(
      `WITH base AS (
         SELECT d.id,
                d.type_demarche,
                d.created_at AS deposee_le,
                (SELECT MIN(t.created_at)
                   FROM demarche_timeline t
                  WHERE t.demarche_id = d.id
                    AND t.statut IN ('traitee', 'rejetee')) AS cloturee_le
         FROM demarches d
         WHERE d.created_at >= $1::timestamptz
       )
       SELECT type_demarche,
              COUNT(*)::int AS nombre,
              COUNT(cloturee_le)::int AS traitees,
              (COUNT(*) FILTER (
                WHERE cloturee_le IS NOT NULL
                  AND (cloturee_le - deposee_le) <= make_interval(days => $2::int)
              ))::int AS dans_delai,
              ROUND(
                (AVG(EXTRACT(EPOCH FROM (cloturee_le - deposee_le)) / 86400.0)::numeric),
                1
              ) AS delai_moyen_jours
       FROM base
       GROUP BY type_demarche
       ORDER BY nombre DESC`,
      [since, DELAI_REGLEMENTAIRE_JOURS]
    );

    const parType = parTypeResult.rows.map((r) => {
      const traitees = r.traitees || 0;
      const dansDelai = r.dans_delai || 0;
      const delai = r.delai_moyen_jours != null ? Number(r.delai_moyen_jours) : null;
      return {
        type_demarche: r.type_demarche,
        nombre: r.nombre,
        traitees,
        dans_delai: dansDelai,
        delai_moyen_jours: delai,
        taux_respect_delai: traitees > 0 ? round1((dansDelai / traitees) * 100) : null,
      };
    });

    // Agrégats globaux dérivés des lignes par type
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

    // Tous les statuts sont présents dans la réponse (0 si absent) pour un affichage stable
    const parStatutMap = Object.fromEntries(
      statutsResult.rows.map((r) => [r.statut, r.nombre])
    );

    return res.json({
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
    });
  } catch (err) {
    console.error('getStatsPubliques error:', err);
    // Dégradation gracieuse : la page publique reste consultable
    return res.json(payloadVide(periode, jours));
  }
};

module.exports = {
  DELAI_REGLEMENTAIRE_JOURS,
  PERIODES,
  getStatsPubliques,
};
