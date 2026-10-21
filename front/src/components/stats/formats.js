/**
 * Formats des statistiques (nombres, dates, pourcentages) — SANS Chart.js.
 *
 * Les écrans de graphiques passent par `chartConfig.js` (point d'entrée
 * unique : enregistrement Chart.js + options + palette + formats re-exportés).
 * Les COMPTEURS (accueil, tableau de bord) importent directement ce module :
 * ils n'ont pas besoin de graphiques et Chart.js reste ainsi hors du bundle
 * principal (lazy loading des graphiques respecté).
 *
 * - Nombres « 1 234 » selon la langue ; « — » si la valeur est invalide.
 * - Dates dans le fuseau Indian/Antananarivo (« lun. 20 oct. » / longue).
 * - Pourcentages avec une seule décimale.
 */

export const FUSEAU = 'Indian/Antananarivo';

/** Locale ICU sûre : « mg »/« fr »/« en » avec repli sur le français. */
export const localeDe = (langue) => {
  const essais = [langue, langue?.split('-')[0], 'fr'].filter(Boolean);
  for (const l of essais) {
    try {
      new Intl.NumberFormat(l);
      return l;
    } catch {
      /* locale inconnue → on essaie la suivante */
    }
  }
  return 'fr';
};

/** « 1 234 » — séparateur de milliers selon la langue ; « — » si non valide. */
export const formatNombre = (langue, valeur) => {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(localeDe(langue), { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
};

/** « 12,5 % » — une seule décimale selon la langue ; « — » si non valide. */
export const formatPourcent = (langue, valeur) => {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return '—';
  try {
    const f = new Intl.NumberFormat(localeDe(langue), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `${f.format(n)} %`;
  } catch {
    return `${n} %`;
  }
};

/** Date courte lisible (« lun. 20 oct. ») dans le fuseau de Madagascar. */
export const dateCourte = (langue, valeur) => {
  if (valeur === undefined || valeur === null || valeur === '') return '';
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(localeDe(langue), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: FUSEAU,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

/** Date longue (« samedi 18 octobre 2026 ») pour les infobulles. */
export const dateLongue = (langue, valeur) => {
  if (valeur === undefined || valeur === null || valeur === '') return '';
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(localeDe(langue), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: FUSEAU,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};
