/**
 * Mailer (portage de backend/src/config/mailer.js) pour Strapi 5.
 *
 * - SMTP : réutilise les variables EMAIL_* du .env (SMTP_* acceptées en priorité).
 * - Sans compte SMTP : en dev le contenu des mails est affiché en console ;
 *   en production l'envoi est simplement ignoré (log d'erreur).
 *
 * Utilisé par les lifecycle hooks (newsletter, démarches) et les controllers
 * custom (subscribe / unsubscribe). Fire-and-forget : ne rejette jamais.
 */
import nodemailer from 'nodemailer';
import { render, label, resolveLang, escapeHtml } from './email-templates';

// ─── Configuration SMTP ─────────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '', 10) || 587;
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;

const MAIL_FROM =
  process.env.EMAIL_FROM || `"Bibliothèque Numérique MTeFOP" <${SMTP_USER || 'no-reply@mtefop.gouv'}>`;

const SITE_NAME = process.env.SITE_NAME || 'Bibliothèque Numérique MTeFOP';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Le mailer est désactivé tant qu'aucun compte SMTP n'est fourni.
export const MAILER_ENABLED = Boolean(SMTP_USER && SMTP_PASS);

const transporter = MAILER_ENABLED
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER as string, pass: SMTP_PASS as string },
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
  console.error(
    '❌ Mailer désactivé : EMAIL_USER / EMAIL_PASSWORD non configurés — aucun mail ne sera envoyé.'
  );
} else {
  console.warn(
    '⚠️  Mailer en mode développement : EMAIL_USER / EMAIL_PASSWORD non configurés, les mails seront affichés en console.'
  );
}

// ─── URL publique du site (liens de confirmation / désabonnement) ───────────
export const SITE_URL =
  process.env.FRONTEND_URL || process.env.SITE_URL || process.env.DOMAIN || 'http://localhost:5173';

const upperFirst = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s as string);

// ─── Helper d'envoi ─────────────────────────────────────────────────────────

interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  lang?: string;
  bcc?: string;
}

/**
 * Affichage en console d'un mail non envoyé (mode développement uniquement).
 * Permet de récupérer les liens de confirmation / désabonnement sans SMTP.
 */
const logMailToConsole = (options: MailOptions) => {
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
 * Envoie un message. Fire-and-forget côté appelants : cette fonction ne
 * rejette jamais, elle log l'erreur et renvoie false.
 */
const sendMail = async (options: MailOptions): Promise<boolean> => {
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
    console.error('Mailer error:', (err as Error).message);
    return false;
  }
};

/** Rend un gabarit puis envoie le mail correspondant. */
const sendTemplatedMail = (
  to: string,
  lang: string | null | undefined,
  templateName: string,
  vars: Record<string, unknown>,
  extra: Partial<MailOptions> = {}
): Promise<boolean> => {
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

export const sendConfirmationEmail = async (email: string, confirmToken: string, lang = 'fr') => {
  const confirmUrl = `${SITE_URL}/subscribe/confirm/${confirmToken}`;
  await sendTemplatedMail(email, lang, 'confirmation', { confirmUrl, siteUrl: SITE_URL });
};

// ─── Activation de compte (module auth-compat) ──────────────────────────────

export const sendActivationEmail = async (
  email: string,
  uid: string,
  token: string,
  lang = 'fr'
) => {
  const activationUrl = `${SITE_URL}/activate/${uid}/${token}`;
  await sendTemplatedMail(email, lang, 'activation', {
    activationUrl,
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
  });
};

// ─── Réinitialisation de mot de passe (module auth-compat) ──────────────────

export const sendResetPasswordEmail = async (email: string, resetUrl: string, lang = 'fr') => {
  await sendTemplatedMail(email, lang, 'reset-password', {
    resetUrl,
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
  });
};

// ─── Envoi groupé lors d'une nouvelle publication ───────────────────────────

// Nombre de mails envoyés en parallèle avant de passer au lot suivant
const BATCH_SIZE = 20;

interface SubscriberRecipient {
  email: string;
  unsubscribe_token?: string | null;
  langue_preferee?: string | null;
}

/**
 * Notifie les abonnés confirmés d'une nouvelle publication.
 *
 * Chaque abonné reçoit un mail individuel (afin qu'il dispose de SON lien de
 * désabonnement personnel), dans SA langue préférée (repli sur `lang`).
 * Les envois sont parallélisés par lots.
 */
export const sendNewPublicationEmail = async (
  type: 'document' | 'actualite',
  titre: string,
  lien: string | null,
  recipients: (SubscriberRecipient | string)[],
  lang = 'fr'
) => {
  if (!recipients || recipients.length === 0) return;

  // Accepte aussi bien des chaînes que des objets { email, unsubscribe_token, langue_preferee }
  const normalized = recipients
    .map((r) => (typeof r === 'string' ? { email: r } : r))
    .filter((r): r is SubscriberRecipient => Boolean(r && r.email));

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

export const sendDemarcheStatusEmail = async (
  email: string,
  typeDemarche: string,
  statut: string,
  commentaire: string | null,
  lang = 'fr'
) => {
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

export const sendUnsubscribeConfirmationEmail = async (email: string, lang = 'fr') => {
  await sendTemplatedMail(email, lang, 'unsubscribe', { siteUrl: SITE_URL });
};

// ─── Réponse de l'administration à une remarque ─────────────────────────────
// (endpoint /api/send-response/ appelé par le front AdminRemarks.jsx — absent
// du legacy, reconstitué ici avec le gabarit demarche-status.)

export const sendRemarkResponseEmail = async (
  email: string,
  response: string,
  lang = 'fr'
) => {
  const code = resolveLang(lang);
  const commentaireHtml = `<p><strong>${escapeHtml(
    label(code, 'commentaire_admin')
  )}</strong><br>${escapeHtml(response)}</p>`;
  await sendTemplatedMail(email, code, 'demarche-status', {
    typeDemarche: escapeHtml('remarque'),
    statutLabel: label(code, 'statut_traitee'),
    commentaireHtml,
    suiviUrl: SITE_URL,
    siteUrl: SITE_URL,
  });
};

export { MAILER_ENABLED as _MAILER_ENABLED, SITE_NAME as _SITE_NAME };
