/**
 * P1 — Normalisation des types de documents (logique PURE, testable sans base).
 *
 * Partagée par :
 *  - `scripts/p1-migrate.ts` (migration des données en base) ;
 *  - `tests/p1-normalizer.test.cjs` (tests node purs).
 *
 * ⚠️ Maintenir en cohérence avec `front/src/utils/documentTypes.js` (même liste
 * canonique) — le front affiche les libellés, ce module normalise les valeurs.
 */
'use strict';

/** Liste contrôlée P1 — forme canonique stockée en base. */
const CANONICAL_TYPES = [
  'constitution',
  'traites_internationaux',
  'convention',
  'loi_organique',
  'loi_ordinaires',
  'ordonnance',
  'decret',
  'arrete_interministeriel',
  'arrete',
  'circulaire',
  'note',
];

/**
 * Variantes historiques constatées dans le code/les données → forme canonique.
 * Clés : normalisées (minuscules, sans accents, espaces réduits).
 */
const ALIASES = {
  constitution: 'constitution',
  'traites internationaux': 'traites_internationaux',
  'traites international': 'traites_internationaux',
  convention: 'convention',
  'lois organiques': 'loi_organique',
  'loi organique': 'loi_organique',
  'lois ordinaires': 'loi_ordinaires',
  'loi ordinaires': 'loi_ordinaires',
  'loi ordinaire': 'loi_ordinaires',
  ordonnances: 'ordonnance',
  ordonnance: 'ordonnance',
  decrets: 'decret',
  decret: 'decret',
  'arretes interministeriels': 'arrete_interministeriel',
  'arretes interministeriel': 'arrete_interministeriel',
  'arrete interministeriel': 'arrete_interministeriel',
  arretes: 'arrete',
  arrete: 'arrete',
  circilaire: 'circulaire', // faute de frappe historique du front
  circulaire: 'circulaire',
  notes: 'note',
  note: 'note',
};

/** Clé de normalisation : minuscules, sans accents, espaces réduits. */
const normalizeKey = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

/**
 * Retourne la forme canonique d'une valeur de type.
 * @returns {string|null} la forme canonique, ou null si la valeur est inconnue
 *   (elle ne doit PAS être modifiée — à examiner manuellement).
 */
const canonicalizeType = (raw) => {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const key = normalizeKey(v);
  if (ALIASES[key]) return ALIASES[key];
  // déjà canonique ?
  if (CANONICAL_TYPES.includes(key)) return key;
  return null;
};

/**
 * Normalise un tableau de mots-clés (chaîne « a, b » ou tableau).
 * @returns {string[]} tableau vide si rien de valable.
 */
const normalizeKeywords = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((m) => String(m).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return [];
};

module.exports = { CANONICAL_TYPES, ALIASES, normalizeKey, canonicalizeType, normalizeKeywords };
