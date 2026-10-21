/**
 * Mailer (portage de backend/src/config/mailer.js) pour Strapi 5.
 *
 * - SMTP : variables SMTP_* (prioritaires) ou EMAIL_* ; mode capture locale
 *   via SMTP_NO_AUTH (scripts/smtp-capture.ts, tests sans envoi réel).
 * - Sans compte SMTP : en dev le contenu des mails est affiché en console ;
 *   en production un BANNIER d'erreur est affiché au démarrage et chaque
 *   envoi est compté comme un échec (jamais bloquant pour l'application).
 * - Fiabilité : essais limités avec backoff sur erreurs temporaires,
 *   débit limité par lots (MAIL_BATCH_SIZE / MAIL_BATCH_PAUSE_MS),
 *   résumé d'envoi structuré renvoyé à l'appelant.
 * - Délivrabilité : en-tête List-Unsubscribe (lien personnel du jeton) sur
 *   les alertes de publication, version texte brute toujours fournie.
 * - Logs : adresses e-mail masquées (j***@gmail.com) hors affichage console
 *   de développement.
 *
 * Utilisé par les lifecycle hooks (alertes de publication) et les controllers
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
// Mode capture (tests hors production) : serveur local SANS authentification
// (scripts/smtp-capture.ts, port 1025). Ni SMTP_USER ni SMTP_PASS requis.
const SMTP_NO_AUTH = process.env.SMTP_NO_AUTH === 'true';

const MAIL_FROM =
  process.env.EMAIL_FROM || `"Bibliothèque Numérique MTeFOP" <${SMTP_USER || 'no-reply@mtefop.gouv'}>`;

const SITE_NAME = process.env.SITE_NAME || 'Bibliothèque Numérique MTeFOP';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── Réglages d'envoi (débit, fiabilité, sujet) ─────────────────────────────
// Taille d'un lot en parallèle + pause entre lots (quotas SMTP).
const BATCH_SIZE = Math.max(1, parseInt(process.env.MAIL_BATCH_SIZE || '', 10) || 20);
const BATCH_PAUSE_MS = Math.max(0, parseInt(process.env.MAIL_BATCH_PAUSE_MS || '', 10) || 1000);
// Nouvel essai limité pour les erreurs TEMPORAIRES uniquement.
const RETRY_ATTEMPTS = Math.min(5, Math.max(1, parseInt(process.env.MAIL_RETRY_ATTEMPTS || '', 10) || 3));
const RETRY_DELAY_MS = Math.max(0, parseInt(process.env.MAIL_RETRY_DELAY_MS || '', 10) || 1000);
// Titre injecté dans le SUJET : troncature propre (le titre reste entier dans le corps).
const SUBJECT_TITLE_MAX = Math.max(20, parseInt(process.env.MAIL_SUBJECT_TITLE_MAX || '', 10) || 120);

// Le mailer est activé dès qu'un compte SMTP est fourni, ou en mode capture.
export const MAILER_ENABLED = SMTP_NO_AUTH ? true : Boolean(SMTP_USER && SMTP_PASS);

const transporter = MAILER_ENABLED
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      // Capture locale : jamais de démarrage TLS ni d'authentification.
      ...(SMTP_NO_AUTH ? { ignoreTLS: true } : {}),
      ...(SMTP_NO_AUTH || !SMTP_USER ? {} : { auth: { user: SMTP_USER as string, pass: SMTP_PASS as string } }),
    })
  : null;

/** Masque une adresse pour les logs : j***@gmail.com (jamais l'adresse complète). */
export const maskEmail = (email?: string | null): string => {
  const raw = String(email ?? '');
  const at = raw.indexOf('@');
  if (at <= 0) return '***';
  return `${raw.charAt(0)}***${raw.slice(at)}`;
};

const banner = (lines: string[]) => {
  const line = '═'.repeat(78);
  console.error(['', line, ...lines, line, ''].join('\n'));
};

// Variables manquantes, avec leurs alias — affichées telles quelles (noms seulement).
const missingSmtpVars: string[] = [];
if (!SMTP_USER) missingSmtpVars.push('SMTP_USER (ou EMAIL_USER)');
if (!SMTP_PASS && !SMTP_NO_AUTH) missingSmtpVars.push('SMTP_PASS (ou EMAIL_PASSWORD)');

/**
 * Traduit les erreurs SMTP courantes de Gmail (et des autres) en message
 * d'aide lisible. Jamais de mot de passe dans le retour, adresse masquée ailleurs.
 */
export const explainSmtpError = (err: unknown): string => {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const code = String(e?.code || '').toUpperCase();
  const responseCode = Number(e?.responseCode || 0);
  const msg = String(e?.message || String(err || ''));
  const low = msg.toLowerCase();

  if (
    responseCode === 535 ||
    code === 'EAUTH' ||
    /535|authentication failed|invalid login|application-specific password|less secure app|web login required/.test(low)
  ) {
    return (
      "identifiants refusés (535) → un MOT DE PASSE D'APPLICATION est requis : " +
      'activez la validation en 2 étapes sur le compte Google, créez un mot de passe '
        + "d'application (saisi SANS ESPACES) et mettez-le dans SMTP_PASS. " +
      'Le mot de passe normal du compte est refusé.'
    );
  }
  if (
    ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'EDNS', 'ESOCKET'].includes(code) ||
    /connection refused|timed out|timeout|econnrefused/.test(low)
  ) {
    return (
      `connexion refusée ou délai dépassé sur ${SMTP_HOST}:${SMTP_PORT} → ce port est peut-être ` +
      `bloqué par le réseau : essayez SMTP_PORT=465 avec SMTP_SECURE=true ` +
      '(ou changez de réseau / vérifiez qu\'aucun proxy ne bloque la sortie).'
    );
  }
  if (responseCode === 452 || responseCode === 421 || /quota|too many messages|rate limit|exceeded/.test(low)) {
    return 'quota dépassé (limite Gmail ~500 e-mails/jour, ou pic temporaire) → réessayez plus tard.';
  }
  return msg || 'cause inconnue (voir message ci-dessus).';
};

if (transporter) {
  if (SMTP_NO_AUTH) {
    console.log(
      '✅ Mailer ACTIF : mode capture locale, sans authentification (SMTP_NO_AUTH=true)'
    );
  } else {
    // Adresse masquée (j***@gmail.com) ; le mot de passe n'est JAMAIS affiché.
    console.log(
      `✅ Mailer ACTIF : envoi via ${SMTP_HOST}:${SMTP_PORT} en tant que ${maskEmail(SMTP_USER)}`
    );
  }
  // Vérifie la connexion au démarrage (non bloquant, sauf MAIL_STRICT)
  transporter.verify((err) => {
    if (err) {
      console.warn(
        `⚠️  Mailer : vérification impossible (${SMTP_HOST}:${SMTP_PORT}) – ${err.message}`
      );
      console.warn(`   → Aide : ${explainSmtpError(err)}`);
    } else {
      console.log(
        `✅ Mailer : connexion SMTP établie (${SMTP_NO_AUTH ? 'mode capture, sans auth' : SMTP_HOST})`
      );
    }
  });
} else {
  const missing = missingSmtpVars.join(', ') || `SMTP_HOST + SMTP_NO_AUTH`;
  const hint =
    'Strapi lit strapi-backend/.env AU DÉMARRAGE : après modification, redémarrez-le (npm run dev).';
  if (IS_PRODUCTION) {
    banner([
      '❌ MAILER INACTIF EN PRODUCTION — variable(s) manquante(s) : ' + missing,
      '   AUCUN E-MAIL NE SERA ENVOYÉ (confirmations, désabonnements et alertes',
      '   de publication inclus).',
      `   → ${hint} Voir .env.example (option A ou B).`,
    ]);
  } else {
    console.warn(
      [
        '⚠️  Mailer INACTIF : variable(s) manquante(s) : ' + missing,
        '   Les e-mails seront AFFICHÉS EN CONSOLE au lieu d\'être envoyés (aucun envoi réel).',
        `   → ${hint}`,
      ].join('\n')
    );
  }
}

// ─── Contrôle des LIENS en production ───────────────────────────────────────
const FRONTEND_URL_RAW =
  process.env.FRONTEND_URL || process.env.SITE_URL || process.env.DOMAIN || '';
const FRONTEND_URL_IS_LOCALHOST =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(FRONTEND_URL_RAW);

if (IS_PRODUCTION) {
  if (!FRONTEND_URL_RAW) {
    banner([
      '❌ FRONTEND_URL absent : les liens des e-mails (confirmation, désabonnement,',
      '   fiches documentaires) seraient FAUXS. → Renseignez FRONTEND_URL (cf. .env.example).',
    ]);
  } else if (FRONTEND_URL_IS_LOCALHOST) {
    banner([
      `❌ FRONTEND_URL pointe sur localhost (${FRONTEND_URL_RAW}) : les liens des e-mails`,
      '   ne fonctionneront pas pour les destinataires. → Renseignez l’URL publique du front.',
    ]);
  }

  if (process.env.MAIL_STRICT === 'true' && (!MAILER_ENABLED || !FRONTEND_URL_RAW || FRONTEND_URL_IS_LOCALHOST)) {
    throw new Error(
      'MAIL_STRICT=true : configuration e-mail incomplète en production ' +
        `(SMTP=${MAILER_ENABLED ? 'ok' : 'MANQUANT'}, FRONTEND_URL=${FRONTEND_URL_RAW || 'ABSENT'})`
    );
  }
}

// ─── URL publique du site (liens de confirmation / désabonnement) ───────────
export const SITE_URL =
  process.env.FRONTEND_URL || process.env.SITE_URL || process.env.DOMAIN || 'http://localhost:5173';

const upperFirst = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : (s as string));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tronque proprement un titre pour le SUJET (avant tout échappement HTML). */
const subjectTitle = (titre: unknown): string => {
  const raw = String(titre ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (raw.length <= SUBJECT_TITLE_MAX) return raw;
  return `${raw.slice(0, SUBJECT_TITLE_MAX - 1).trimEnd()}…`;
};

// ─── Helper d'envoi ─────────────────────────────────────────────────────────

interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  lang?: string;
  bcc?: string;
  headers?: Record<string, string>;
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

/** Une erreur SMTP est-elle temporaire (donc réessayable) ? */
const isTransientError = (err: unknown): boolean => {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const code = String(e?.code || '').toUpperCase();
  if (
    ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EPIPE', 'EDNS', 'ECONNREFUSED', 'EAGAIN'].includes(
      code
    )
  ) {
    return true;
  }
  const responseCode = Number(e?.responseCode || 0);
  if (responseCode >= 400 && responseCode < 500) return true; // 4xx temporaire (quota, greylisting)
  if (responseCode >= 500 && responseCode < 600) return false; // 5xx permanent
  const msg = String(e?.message || '').toLowerCase();
  return /timed out|timeout|connection|temporarily|try again|greylist|rate limit/.test(msg);
};

interface SendResult {
  ok: boolean;
  attempts: number;
  error?: string;
}

/**
 * Envoie un message AVEC nouvel essai limité sur erreur temporaire.
 * Ne rejette jamais : log l'erreur (adresse masquée) et renvoie ok=false.
 */
const sendMailOnce = async (options: MailOptions): Promise<SendResult> => {
  if (!transporter) {
    if (IS_PRODUCTION) {
      console.error(`Mailer : SMTP non configuré, message ignoré pour ${maskEmail(options.to)}`);
      return { ok: false, attempts: 0, error: 'SMTP non configuré' };
    }
    logMailToConsole(options);
    // Mode dev sans SMTP : affiché en console, mais compté comme non envoyé
    // pour que les résumés reflètent la réalité.
    return { ok: false, attempts: 0, error: 'SMTP non configuré (affiché en console)' };
  }

  let lastError = '';
  let lastErr: unknown = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      await transporter.sendMail({ from: MAIL_FROM, ...options });
      return { ok: true, attempts };
    } catch (err) {
      lastErr = err;
      lastError = (err as Error).message || String(err);
      const transient = isTransientError(err);
      console.error(
        `Mailer : échec essai ${attempt}/${RETRY_ATTEMPTS}${transient ? ' (temporaire)' : ' (permanent)'} → ${maskEmail(options.to)} : ${lastError}`
      );
      if (!transient || attempt >= RETRY_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS * attempt); // backoff linéaire
    }
  }
  // Aide lisible une seule fois, après épuisement des essais (adresse masquée).
  console.error(`Mailer : envoi abandonné → ${maskEmail(options.to)} — cause : ${explainSmtpError(lastErr)}`);
  return { ok: false, attempts, error: lastError };
};

/** Variante booléenne (appels simples : confirmation, désabonnement…). */
const sendMail = async (options: MailOptions): Promise<boolean> =>
  (await sendMailOnce(options)).ok;

/** Rend un gabarit puis envoie le mail correspondant. */
const sendTemplatedMail = async (
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

export const sendConfirmationEmail = async (
  email: string,
  confirmToken: string,
  lang = 'fr'
): Promise<boolean> => {
  const confirmUrl = `${SITE_URL}/subscribe/confirm/${confirmToken}`;
  return sendTemplatedMail(email, lang, 'confirmation', { confirmUrl, siteUrl: SITE_URL });
};

// ─── Activation de compte (module auth-compat) ──────────────────────────────

export const sendActivationEmail = async (
  email: string,
  uid: string,
  token: string,
  lang = 'fr'
): Promise<boolean> => {
  const activationUrl = `${SITE_URL}/activate/${uid}/${token}`;
  return sendTemplatedMail(email, lang, 'activation', {
    activationUrl,
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
  });
};

// ─── Réinitialisation de mot de passe (module auth-compat) ──────────────────

export const sendResetPasswordEmail = async (
  email: string,
  resetUrl: string,
  lang = 'fr'
): Promise<boolean> =>
  sendTemplatedMail(email, lang, 'reset-password', {
    resetUrl,
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
  });

// ─── Envoi groupé lors d'une nouvelle publication ───────────────────────────

interface SubscriberRecipient {
  email: string;
  unsubscribe_token?: string | null;
  langue_preferee?: string | null;
}

/** Résumé d'un envoi groupé — structuré pour le journal et la console. */
export interface PublicationSendSummary {
  total: number;
  sent: number;
  failed: number;
  durationMs: number;
  /** Messages d'erreur (sans adresse) — au maximum 5. */
  errors: string[];
}

/** Ligne de lien cliquable : conservée telle quelle dans le HTML, lisible dans le texte. */
const linkLine = (lang: string, labelKey: string, url: string): string =>
  `${label(lang, labelKey)} <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;

/**
 * Notifie les abonnés confirmés d'une nouvelle publication.
 *
 * Chaque abonné reçoit un mail individuel (afin qu'il dispose de SON lien de
 * désabonnement personnel), dans SA langue préférée (repli sur `lang`).
 * Lots de MAIL_BATCH_SIZE en parallèle, pause MAIL_BATCH_PAUSE_MS entre les
 * lots, nouvel essai limité sur erreur temporaire, résumé renvoyé à l'appelant.
 * Ne rejette JAMAIS : l'échec d'envoi ne doit pas empêcher la publication.
 */
export const sendNewPublicationEmail = async (
  type: 'document' | 'actualite',
  titre: string,
  lien: string | null,
  recipients: (SubscriberRecipient | string)[],
  lang = 'fr'
): Promise<PublicationSendSummary> => {
  const startedAt = Date.now();
  const summary: PublicationSendSummary = {
    total: 0,
    sent: 0,
    failed: 0,
    durationMs: 0,
    errors: [],
  };

  // Accepte aussi bien des chaînes que des objets { email, unsubscribe_token, langue_preferee }
  const normalized = (recipients || [])
    .map((r) => (typeof r === 'string' ? { email: r } : r))
    .filter((r): r is SubscriberRecipient => Boolean(r && r.email));

  summary.total = normalized.length;
  if (summary.total === 0) {
    summary.durationMs = Date.now() - startedAt;
    return summary;
  }

  // Sujet : titre BRUT (tronqué, sans entité HTML) — seul le corps reçoit le titre échappé.
  const titreSubject = subjectTitle(titre);
  const titreHtml = escapeHtml(titre);

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (sub): Promise<{ ok: boolean; error?: string }> => {
        const subLang = resolveLang(sub.langue_preferee || lang);
        const typeLabel = label(
          subLang,
          type === 'document' ? 'publication_document' : 'publication_actualite'
        );
        const detailLine = lien
          ? linkLine(subLang, 'consulter_ici', lien)
          : linkLine(subLang, 'visiter_bibliotheque', SITE_URL);
        // Lien de désabonnement personnel (jeton) ; à défaut de jeton : accueil
        // (honnête — l'URL /unsubscribe sans jeton n'existe pas côté front).
        const unsubscribeUrl = sub.unsubscribe_token
          ? `${SITE_URL}/unsubscribe/${sub.unsubscribe_token}`
          : SITE_URL;

        const tpl = render(subLang, 'publication', {
          typeLabel,
          typeLabelUpper: upperFirst(typeLabel),
          titre: titreHtml,
          titreSubject,
          detailLine,
          unsubscribeUrl,
          siteUrl: SITE_URL,
        });

        return sendMailOnce({
          to: sub.email,
          lang: subLang,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
          // Délivrabilité : lien de désabonnement personnel exposé aux clients mail.
          ...(sub.unsubscribe_token
            ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } }
            : {}),
        });
      })
    );

    for (const r of results) {
      if (r.ok) summary.sent += 1;
      else {
        summary.failed += 1;
        if (r.error && summary.errors.length < 5) summary.errors.push(r.error);
      }
    }

    // Pause entre les lots pour respecter les quotas SMTP (pas après le dernier).
    if (BATCH_PAUSE_MS > 0 && i + BATCH_SIZE < normalized.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  summary.durationMs = Date.now() - startedAt;
  const counts = `${summary.sent} envoyé(s), ${summary.failed} échec(s) sur ${summary.total}`;
  const titreLog = subjectTitle(titre).slice(0, 60);
  const duree = `${(summary.durationMs / 1000).toFixed(1)} s`;
  if (summary.failed > 0) {
    console.error(`📧 [${type}] « ${titreLog} » — ${counts} (${duree})`);
  } else {
    console.log(`📧 [${type}] « ${titreLog} » — ${counts} (${duree})`);
  }
  return summary;
};

// ─── Confirmation de désabonnement ──────────────────────────────────────────

export const sendUnsubscribeConfirmationEmail = async (
  email: string,
  lang = 'fr'
): Promise<boolean> => sendTemplatedMail(email, lang, 'unsubscribe', { siteUrl: SITE_URL });

// ─── Réponse de l'administration à une remarque ──────────────────────────────
// (endpoint /api/send-response/ appelé par le front AdminRemarks.jsx — absent
// du legacy, reconstitué ici avec le gabarit demarche-status.)

export const sendRemarkResponseEmail = async (
  email: string,
  response: string,
  lang = 'fr'
): Promise<boolean> => {
  const code = resolveLang(lang);
  const commentaireHtml = `<p><strong>${escapeHtml(
    label(code, 'commentaire_admin')
  )}</strong><br>${escapeHtml(response)}</p>`;
  return sendTemplatedMail(email, code, 'demarche-status', {
    typeDemarche: escapeHtml('remarque'),
    statutLabel: label(code, 'statut_traitee'),
    commentaireHtml,
    suiviUrl: SITE_URL,
    siteUrl: SITE_URL,
  });
};

export { MAILER_ENABLED as _MAILER_ENABLED, SITE_NAME as _SITE_NAME };
