/**
 * URL de recherche externe → onglet « Livres » de Google (tbm=bks).
 *
 * Centralisé ici pour ne jamais écrire l'URL en dur dans les composants.
 * Le paramètre `hl` (langue d'interface Google) reprend la langue active de
 * l'application : fr, en et mg — mg étant bien dans la liste des langues
 * supportées par le paramètre hl de Google. Toute langue non reconnue
 * (ex. « fr-FR » non normalisé, code inconnu) retombe sur fr.
 *
 * @param {string} terme  Terme brut (non encodé) saisi par l'utilisateur.
 * @param {string} langue Langue active de l'interface (i18n.language).
 * @returns {string|null} URL complète, ou null si le terme est vide → aucun lien affiché.
 */
export const buildGoogleBooksUrl = (terme, langue = 'fr') => {
  const termeNettoye = typeof terme === 'string' ? terme.trim() : '';
  if (!termeNettoye) return null;

  const code = String(langue || 'fr').split('-')[0].toLowerCase();
  const hl = ['fr', 'en', 'mg'].includes(code) ? code : 'fr';

  return `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(
    termeNettoye
  )}&hl=${hl}`;
};

export default buildGoogleBooksUrl;
