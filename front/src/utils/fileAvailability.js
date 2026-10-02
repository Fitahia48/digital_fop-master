/**
 * P1 — Disponibilité du fichier d'une notice (forme legacy).
 *
 * Règle d'affichage : une notice ne présente des boutons « lire/télécharger »
 * QUE si un chemin de fichier réel existe. Une URL vide, null ou la chaîne
 * "null" ⇒ « fichier non disponible » — aucun lien mort.
 */
export const fileAvailability = (doc) => {
  const raw = doc?.pdf_file || doc?.fichier || null;
  if (!raw) return { available: false, url: null };
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return { available: false, url: null };
  }
  return { available: true, url: s };
};
