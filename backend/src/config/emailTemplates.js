const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────
// Langues supportées par l'application : fr (fallback), en, mg (malagasy, ISO 639-1).
const SUPPORTED_LANGS = ['fr', 'en', 'mg'];
const DEFAULT_LANG = 'fr';
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');

// Cache mémoire des gabarits lus sur disque (évite une lecture à chaque envoi).
const cache = new Map();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalise un code langue quelconque vers une langue supportée (sinon fr). */
const resolveLang = (lang) => {
  const code = String(lang || '').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGS.includes(code) ? code : DEFAULT_LANG;
};

/** Échappe une valeur destinée à être injectée dans du HTML (données usager). */
const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Déduit la langue depuis un en-tête Accept-Language
 * (ex. « en-US,en;q=0.9,fr;q=0.8 » → « en »).
 */
const langFromHeader = (header) => {
  const raw = String(header || '');
  for (const part of raw.split(',')) {
    const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
    if (SUPPORTED_LANGS.includes(code)) return code;
  }
  return DEFAULT_LANG;
};

/**
 * Détermine la langue à utiliser pour un email : champ explicite prioritaire,
 * sinon en-tête Accept-Language, sinon français.
 */
const resolveRequestLang = (req, explicit) => {
  const header = req && req.headers ? req.headers['accept-language'] : undefined;
  return resolveLang(explicit || langFromHeader(header));
};

// ─── Chargement / rendu des gabarits ────────────────────────────────────────

const loadTemplate = (lang, name) => {
  const key = `${lang}/${name}`;
  if (!cache.has(key)) {
    cache.set(key, fs.readFileSync(path.join(TEMPLATES_DIR, `${key}.html`), 'utf8'));
  }
  return cache.get(key);
};

const interpolate = (input, vars) =>
  input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));

/** Version texte brut d'un HTML (mode développement : affichage en console). */
const htmlToText = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|tr|li)>/gi, '\n')
    .replace(/<hr[^>]*>/gi, `\n${'-'.repeat(34)}\n`)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Rend un gabarit : lit `{lang}/{name}.html`, extrait le sujet de la ligne
 * `<!-- subject: ... -->` et remplace les `{{variables}}`.
 * @returns {{subject: string, html: string, text: string}}
 */
const render = (lang, name, vars = {}) => {
  const html = loadTemplate(resolveLang(lang), name);
  const subjectMatch = html.match(/<!--\s*subject:\s*([\s\S]*?)\s*-->/i);
  const subject = subjectMatch ? interpolate(subjectMatch[1].trim(), vars) : '';
  const body = interpolate(html.replace(/<!--\s*subject:[\s\S]*?-->/i, ''), vars);
  return { subject, html: body.trim(), text: htmlToText(body) };
};

// ─── Libellés dynamiques (phrases variables insérées dans les gabarits) ─────

const LABELS = {
  fr: {
    publication_document: 'nouveau document',
    publication_actualite: 'nouvelle actualité',
    consulter_ici: 'Consultez ici :',
    visiter_bibliotheque: 'Visitez la bibliothèque :',
    commentaire_admin: "Commentaire de l'administration :",
    statut_soumise: 'Soumise',
    statut_en_cours: 'En cours de traitement',
    statut_traitee: 'Traitée',
    statut_rejetee: 'Rejetée',
  },
  en: {
    publication_document: 'new document',
    publication_actualite: 'new announcement',
    consulter_ici: 'View it here:',
    visiter_bibliotheque: 'Visit the library:',
    commentaire_admin: 'Comment from the administration:',
    statut_soumise: 'Submitted',
    statut_en_cours: 'In progress',
    statut_traitee: 'Processed',
    statut_rejetee: 'Rejected',
  },
  mg: {
    // TODO: à valider par un locuteur natif / juriste (terminologie administrative)
    publication_document: 'antontan-taratasy vaovao',
    publication_actualite: 'fampahafantarana vaovao',
    consulter_ici: 'Jereo eto:',
    visiter_bibliotheque: 'Tsidiho ny tranomboky:',
    commentaire_admin: 'Fanamarihana avy amin\'ny fitantanan-draharaha:',
    statut_soumise: 'Nalefa',
    statut_en_cours: 'Eo am-pandalovana',
    statut_traitee: 'Voavaha',
    statut_rejetee: 'Nolavina',
  },
};

/** Récupère un libellé traduit, avec repli sur la version française. */
const label = (lang, key, vars = {}) => {
  const dict = LABELS[resolveLang(lang)] || LABELS[DEFAULT_LANG];
  const raw = dict[key] != null ? dict[key] : LABELS[DEFAULT_LANG][key] || '';
  return interpolate(raw, vars);
};

module.exports = {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  resolveLang,
  resolveRequestLang,
  langFromHeader,
  escapeHtml,
  render,
  label,
};
