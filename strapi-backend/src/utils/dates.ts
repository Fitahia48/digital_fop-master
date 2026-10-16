/**
 * Dates « métier » du projet, exprimées dans le fuseau de Madagascar (UTC+3).
 *
 * Pourquoi un helper : le comptage des visites (middlewares/track-visit.ts) et
 * la lecture des statistiques (api/statistics/controllers/statistics.ts)
 * doivent parler du MÊME jour. En les recalculant chacun de leur côté, le
 * contrôleur utilisait :
 *
 *     new Date().toLocaleString('en-CA', { timeZone: 'Indian/Antananarivo' })
 *       .split(' ')[0]
 *
 * Or Node renvoie « 2026-10-16, 1:17:02 p.m. » : le `split(' ')[0]` produisait
 * « 2026-10-16, » (virgule finale) → `WHERE visit_date = ?` ne correspondait à
 * AUCUNE ligne et `visits_today` valait toujours 0 (compteur « temps réel » du
 * tableau de bord et compteur flottant de l'accueil figés à 0).
 */

/** Décalage fixe de Madagascar (pas d'heure d'été). */
const OFFSET_MINUTES = 3 * 60;

/** Instant courant décalé dans le fuseau de Madagascar. */
const dansFuseau = (ref: Date) => new Date(ref.getTime() + OFFSET_MINUTES * 60_000);

/** Jour courant à Madagascar, au format AAAA-MM-JJ (comparable aux colonnes `date`). */
export const dateJourMadagascar = (ref: Date = new Date()): string =>
  dansFuseau(ref).toISOString().slice(0, 10);

/** Horodatage courant à Madagascar, au format « AAAA-MM-JJ HH:mm:ss ». */
export const horodatageMadagascar = (ref: Date = new Date()): string =>
  dansFuseau(ref).toISOString().slice(0, 19).replace('T', ' ');

export default { dateJourMadagascar, horodatageMadagascar };
