require('dotenv').config();
const nodemailer = require('nodemailer');
const { render, label, resolveLang, escapeHtml } = require('./emailTemplates');

// ─── Configuration SMTP ─────────────────────────────────────────────────────
// On réutilise les variables EMAIL_* déjà présentes dans le .env du projet
// (voir auth.controller.js). Les variables SMTP_* restent acceptées en priorité.

const SMTP_HOST = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;

const MAIL_FROM = process.env.EMAIL_FROM ||
  `"Bibliothèque Numérique MTeFOP" <${SMTP_USER || 'no-reply@mtefop.gouv'}>`;

const SITE_NAME = process.env.SITE_NAME || 'Bibliothèque Numérique MTeFOP';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Le mailer est désactivé tant qu'aucun compte SMTP n'est fourni.
// En développement, le contenu des mails est alors affiché en console afin de
// pouvoir tester les parcours sans serveur SMTP.
const MAILER_ENABLED = Boolean(SMTP_USER && SMTP_PASS);

const transporter = MAILER_ENABLED
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

if (transporter) {
  // Vérifie la connexion au démarrage (non bloquant)
  transporter.verify((err) => {
    if (err) {
      console.warn('⚠️  Mailer : connexion SMTP non disponible –', err.message);
    } else {
      console.log('✅ Mailer : connexion SMTP établie');
    }
  });
} else if (IS_PRODUCTION) {
  console.error('❌ Mailer désactivé : EMAIL_USER / EMAIL_PASSWORD non configurés — aucun mail ne sera envoyé.');
} else {
  console.warn('⚠️  Mailer en mode développement : EMAIL_USER / EMAIL_PASSWORD non configurés, les mails seront affichés en console.');
}

// ─── URL publique du site (liens de confirmation / désabonnement) ───────────

const SITE_URL =
  process.env.FRONTEND_URL || process.env.SITE_URL || process.env.DOMAIN || 'http://localhost:5173';

// ─── Helpers ────────────────────────────────────────────────────────────────

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─── Helper d'envoi ─────────────────────────────────────────────────────────

/**
 * Affichage en console d'un mail non envoyé (mode développement uniquement).
 * Permet de récupérer les liens de confirmation / désabonnement sans SMTP.
 */
const logMailToConsole = (options) => {
  const line = '─'.repeat(60);
  const bcc = options.bcc ? ` (cci : ${options.bcc})` : '';
  console.log(
    [
      '',
      line,
      '📧 MAIL NON ENVOYÉ (développement — aucun SMTP configuré)',
      `À      : ${options.to || '(non défini)'}${bcc}`,
      `Langue : ${options.lang || 'fr'}`,
      `Sujet  : ${options.subject}`,
      line,
      options.text || (options.html ? '[contenu HTML]' : ''),
      line,
      '',
    ].join('\n')
  );
};

/**
 * Envoie un message. Fire-and-forget côté contrôleurs : cette fonction ne
 * rejette jamais, elle log l'erreur et renvoie false.
 */
const sendMail = async (options) => {
  if (!transporter) {
    if (IS_PRODUCTION) {
      console.error('Mailer : SMTP non configuré, message ignoré pour', options.to);
      return false;
    }
    logMailToConsole(options);
    return false;
  }
  try {
    await transporter.sendMail({ from: MAIL_FROM, ...options });
    return true;
  } catch (err) {
    console.error('Mailer error:', err.message);
    return false;
  }
};

/** Rend un gabarit puis envoie le mail correspondant. */
const sendTemplatedMail = (to, lang, templateName, vars, extra = {}) => {
  const tpl = render(lang, templateName, vars);
  return sendMail({
    to,
    lang: resolveLang(lang),
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    ...extra,
  });
};

// ─── Confirmation d'abonnement ──────────────────────────────────────────────

/**
 * Envoie un email de confirmation à un nouvel abonné.
 * @param {string} email
 * @param {string} confirmToken
 * @param {string} [lang] - Langue préférée (fr/en/mg), défaut fr
 */
const sendConfirmationEmail = async (email, confirmToken, lang = 'fr') => {
  const confirmUrl = `${SITE_URL}/subscribe/confirm/${confirmToken}`;
  await sendTemplatedMail(email, lang, 'confirmation', { confirmUrl, siteUrl: SITE_URL });
};

// ─── Envoi groupé lors d'une nouvelle publication ───────────────────────────

// Nombre de mails envoyés en parallèle avant de passer au lot suivant
const BATCH_SIZE = 20;

/**
 * Notifie les abonnés confirmés d'une nouvelle publication.
 *
 * Chaque abonné reçoit un mail individuel (afin qu'il dispose de SON lien de
 * désabonnement personnel), dans SA langue préférée (repli sur `lang`).
 * Les envois sont parallélisés par lots.
 *
 * @param {'document'|'actualite'} type        - Type de contenu publié
 * @param {string}                 titre       - Titre ou objet du contenu
 * @param {string|null}            lien        - URL vers le contenu (optionnel)
 * @param {Array<{email:string, unsubscribe_token?:string, langue_preferee?:string}|string>} recipients
 * @param {string}                 [lang]      - Langue de repli (fr/en/mg)
 */
const sendNewPublicationEmail = async (type, titre, lien, recipients, lang = 'fr') => {
  if (!recipients || recipients.length === 0) return;

  // Accepte aussi bien des chaînes que des objets { email, unsubscribe_token, langue_preferee }
  const normalized = recipients
    .map((r) => (typeof r === 'string' ? { email: r } : r))
    .filter((r) => r && r.email);

  const safeTitre = escapeHtml(titre);

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((sub) => {
        const subLang = resolveLang(sub.langue_preferee || lang);
        const typeLabel = label(
          subLang,
          type === 'document' ? 'publication_document' : 'publication_actualite'
        );
        const detailLine = lien
          ? `${label(subLang, 'consulter_ici')} ${lien}`
          : `${label(subLang, 'visiter_bibliotheque')} ${SITE_URL}`;
        const unsubscribeUrl = sub.unsubscribe_token
          ? `${SITE_URL}/unsubscribe/${sub.unsubscribe_token}`
          : `${SITE_URL}/unsubscribe`;

        return sendTemplatedMail(sub.email, subLang, 'publication', {
          typeLabel,
          typeLabelUpper: upperFirst(typeLabel),
          titre: safeTitre,
          detailLine,
          unsubscribeUrl,
          siteUrl: SITE_URL,
        });
      })
    );
  }
};

// ─── Notification du changement de statut d'une démarche ────────────────────

/**
 * Notifie l'usager que le statut de sa démarche a évolué.
 * @param {string} email            - Email de l'usager
 * @param {string} typeDemarche     - Libellé du type de démarche
 * @param {string} statut           - Nouveau statut (soumise, en_cours, traitee, rejetee)
 * @param {string|null} commentaire - Commentaire facultatif de l'administrateur
 * @param {string} [lang]           - Langue préférée (fr/en/mg)
 */
const sendDemarcheStatusEmail = async (email, typeDemarche, statut, commentaire, lang = 'fr') => {
  const code = resolveLang(lang);
  // Repli sur le code brut si le statut est inconnu (ne devrait pas arriver)
  const statutLabel = label(code, `statut_${statut}`) || statut;
  const commentaireHtml = commentaire
    ? `<p><strong>${escapeHtml(label(code, 'commentaire_admin'))}</strong><br>${escapeHtml(commentaire)}</p>`
    : '';

  await sendTemplatedMail(email, code, 'demarche-status', {
    typeDemarche: escapeHtml(typeDemarche),
    statutLabel,
    commentaireHtml,
    suiviUrl: `${SITE_URL}/mes-demarches`,
    siteUrl: SITE_URL,
  });
};

// ─── Confirmation de désabonnement ──────────────────────────────────────────

/**
 * Envoie un email de confirmation de désabonnement.
 * @param {string} email
 * @param {string} [lang] - Langue préférée (fr/en/mg)
 */
const sendUnsubscribeConfirmationEmail = async (email, lang = 'fr') => {
  await sendTemplatedMail(email, lang, 'unsubscribe', { siteUrl: SITE_URL });
};

// ─── Activation de compte ───────────────────────────────────────────────────

/**
 * Envoie le mail d'activation de compte (auth P0).
 * @param {string} email
 * @param {string} uid
 * @param {string} token
 * @param {string} [lang]
 */
const sendActivationEmail = async (email, uid, token, lang = 'fr') => {
  const activationUrl = `${SITE_URL}/activate/${uid}/${token}`;
  await sendTemplatedMail(email, lang, 'activation', { activationUrl, siteName: SITE_NAME });
};

// ─── Réinitialisation de mot de passe ───────────────────────────────────────

/**
 * Envoie le mail de réinitialisation de mot de passe (auth P0).
 * @param {string} email
 * @param {string} resetUrl - URL complète de réinitialisation (uid + token)
 * @param {string} [lang]
 */
const sendResetPasswordEmail = async (email, resetUrl, lang = 'fr') => {
  await sendTemplatedMail(email, lang, 'reset-password', { resetUrl, siteName: SITE_NAME });
};

module.exports = {
  MAILER_ENABLED,
  sendConfirmationEmail,
  sendNewPublicationEmail,
  sendUnsubscribeConfirmationEmail,
  sendDemarcheStatusEmail,
  sendActivationEmail,
  sendResetPasswordEmail,
};
