/**
 * Lecture des tables analytiques hors Strapi (D7) : compteurs daily/monthly/yearly
 * (`document_stats`, `corps_stats` — MIGRATION.md §2).
 *
 * Deux bugs corrigés ici, en un seul endroit (les deux endpoints
 * `/api/documents-stats` et `/api/corps-stats1` les dupliquaient) :
 *
 *  1. `knex.raw()` renvoie un TABLEAU de lignes sous sqlite (base locale) mais un
 *     objet `{ rows }` sous postgres (base legacy) : `r.rows[0].total` levait donc
 *     « Cannot read properties of undefined (reading '0') » en sqlite → 500.
 *  2. `EXTRACT(MONTH FROM date)` / `EXTRACT(YEAR FROM date)` n'existent que sous
 *     postgres : sous sqlite la requête échoue (« no such function: EXTRACT »),
 *     même pour la période courante. Les bornes du mois / de l'année sont donc
 *     calculées côté serveur et comparées en SQL standard
 *     (`date BETWEEN ? AND ?`), valable sur les deux dialectes.
 *
 * Aucune donnée n'est inventée : les compteurs sont lus tels quels dans les
 * tables legacy (aucune écriture ici).
 */

/** Périodes acceptées par les endpoints de statistiques. */
export const PERIODES = ['daily', 'monthly', 'yearly'] as const;

export type Periode = (typeof PERIODES)[number];

/** Tables autorisées : leurs noms sont interpolés dans le SQL (liste blanche). */
export type TableAnalytique = 'document_stats' | 'corps_stats';

const TABLES_AUTORISEES: readonly TableAnalytique[] = ['document_stats', 'corps_stats'];

/** Colonne de compteurs associée à chaque période (convention des tables legacy). */
const COLONNE_PAR_PERIODE: Record<Periode, string> = {
  daily: 'daily_count',
  monthly: 'monthly_count',
  yearly: 'yearly_count',
};

/** Garde de type : la période reçue en query string est-elle exploitable ? */
export const estPeriodeValide = (period: unknown): period is Periode =>
  typeof period === 'string' && (PERIODES as readonly string[]).includes(period);

/** `knex.raw()` → tableau de lignes (sqlite) ou `{ rows }` (postgres). */
export const rowsOf = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.rows)) return raw.rows;
  return [];
};

const isoDate = (d: Date) => d.toISOString().split('T')[0];

/** Bornes [1er jour, dernier jour] du mois de `ref` (mois et année courants). */
export const bornesMois = (ref = new Date()): [string, string] => [
  isoDate(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))),
  isoDate(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0))),
];

/** Bornes [1er janvier, 31 décembre] de l'année de `ref`. */
export const bornesAnnee = (ref = new Date()): [string, string] => [
  isoDate(new Date(Date.UTC(ref.getUTCFullYear(), 0, 1))),
  isoDate(new Date(Date.UTC(ref.getUTCFullYear(), 11, 31))),
];

/**
 * Fenêtre de présence « en ligne » (minutes) : un visiteur est compté comme en
 * ligne s'il a été vu au moins une fois pendant cette fenêtre. Utilisée par
 * l'écriture (middlewares/track-visit.ts) ET par la lecture
 * (api/statistics/controllers/statistics.ts) → une seule définition.
 */
export const PRESENCE_FENETRE_MINUTES = 5;

/** Rétention des lignes de présence : au-delà, elles ne servent plus (table bornée). */
export const PRESENCE_RETENTION_SECONDES = 24 * 3600;

/**
 * Nombre de visiteurs distincts « en ligne » : ceux vus dans les
 * `fenetreMinutes` dernières minutes (`visitor_presence.last_seen_at`).
 */
export const visiteursEnLigne = async (
  fenetreMinutes: number = PRESENCE_FENETRE_MINUTES
): Promise<number> => {
  const seuil = Math.floor(Date.now() / 1000) - fenetreMinutes * 60;
  const raw = await strapi.db.connection.raw(
    'SELECT COUNT(*) AS total FROM visitor_presence WHERE last_seen_at >= ?',
    [seuil]
  );
  return parseInt(String(rowsOf(raw)[0]?.total ?? 0), 10) || 0;
};

/**
 * Somme des compteurs d'une table analytique pour la période demandée.
 * `startDate`/`endDate` (AAAA-MM-JJ) ne s'appliquent qu'à la période « daily »,
 * comme dans l'implémentation d'origine.
 */
export const sommeStatistiques = async (
  table: TableAnalytique,
  period: Periode,
  startDate?: string,
  endDate?: string
): Promise<number> => {
  if (!TABLES_AUTORISEES.includes(table)) {
    throw new Error(`Table analytique non autorisée : ${table}`);
  }
  const colonne = COLONNE_PAR_PERIODE[period];

  let where: string;
  let binds: string[];
  if (period === 'monthly') {
    where = 'date BETWEEN ? AND ?';
    binds = bornesMois();
  } else if (period === 'yearly') {
    where = 'date BETWEEN ? AND ?';
    binds = bornesAnnee();
  } else if (startDate && endDate) {
    where = 'date BETWEEN ? AND ?';
    binds = [startDate, endDate];
  } else {
    where = 'date = ?';
    binds = [isoDate(new Date())];
  }

  const raw = await strapi.db.connection.raw(
    `SELECT COALESCE(SUM(${colonne}),0) AS total FROM ${table} WHERE ${where}`,
    binds
  );
  return parseInt(String(rowsOf(raw)[0]?.total ?? 0), 10) || 0;
};

export default {
  estPeriodeValide,
  rowsOf,
  bornesMois,
  bornesAnnee,
  sommeStatistiques,
  visiteursEnLigne,
};

