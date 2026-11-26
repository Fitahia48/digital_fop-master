/**
 * Contrôles d'identité partagés par les formulaires qui saisissent un nom, un
 * prénom et une adresse e-mail (profil, création d'un compte, demande de compte).
 *
 * Règles :
 *   - nom : obligatoire et entièrement en majuscules ;
 *   - prénom : facultatif, mais s'il est renseigné il commence par une majuscule ;
 *   - e-mail : obligatoire et de forme valide.
 *
 * Les messages renvoyés sont déjà traduits (clés `validation.*`).
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lettre majuscule, accents inclus (À-Ö, Ø-Þ).
const COMMENCE_MAJUSCULE = /^[A-ZÀ-ÖØ-Þ]/;

export const validateIdentite = ({ nom, prenom, email } = {}, t) => {
  const errors = {};
  const nomValue = String(nom ?? '').trim();
  const prenomValue = String(prenom ?? '').trim();
  const emailValue = String(email ?? '').trim();

  if (!nomValue) {
    errors.nom = t('validation.nom_requis');
  } else if (nomValue !== nomValue.toUpperCase()) {
    errors.nom = t('validation.nom_majuscules');
  }

  if (prenomValue && !COMMENCE_MAJUSCULE.test(prenomValue)) {
    errors.prenom = t('validation.prenom_majuscule');
  }

  if (!emailValue) {
    errors.email = t('validation.email_requis');
  } else if (!EMAIL_PATTERN.test(emailValue)) {
    errors.email = t('validation.email_invalide');
  }

  return errors;
};

export const hasErrors = (errors) => Object.keys(errors).length > 0;

/** Nom saisi : toujours en majuscules. */
export const formatNom = (value) => String(value ?? '').toUpperCase();

/** Prénom saisi : première lettre en majuscule, le reste inchangé. */
export const formatPrenom = (value) => {
  const texte = String(value ?? '');
  if (!texte) return texte;
  return texte.charAt(0).toUpperCase() + texte.slice(1);
};

/** Normalise la valeur d'un champ d'identité pendant la saisie. */
export const normalizeIdentiteField = (name, value) => {
  if (name === 'nom') return formatNom(value);
  if (name === 'prenom') return formatPrenom(value);
  return value;
};
