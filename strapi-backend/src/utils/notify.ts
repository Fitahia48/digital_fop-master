/**
 * Notification des abonnés lors d'une publication — logique partagée par les
 * lifecycles `document` et `actualite`.
 *
 * Décisions produit (ÉTAPE 2) :
 *  - document  : envoi UNIQUEMENT à la publication — création en état
 *    « validée » OU passage vers « validée » (afterUpdate) ;
 *  - actualité : envoi à la création uniquement (pas de brouillon) ;
 *  - anti-doublon : attribut nullable `notifie_le` posé AVANT l'envoi et jamais
 *    réinitialisé → un seul envoi par publication, même si le document repasse
 *    en brouillon puis « validée » ;
 *  - aucun envoi depuis un script : lifecycles désactivés (migrate-data.ts),
 *    script in-process (aucun contexte HTTP) ou en-tête `x-no-notify: 1`
 *    (import via API type import-deaj-2026.ts) ;
 *  - un échec d'envoi ne bloque ni ne fait échouer la création / la mise à jour ;
 *  - chaque envoi (ou non-voi) est tracé dans le content-type `email-log`.
 */
import { sendNewPublicationEmail, SITE_URL } from './mailer';
import { getCurrentCtx } from './request-actor';

const NOTIFY_HEADER = 'x-no-notify';

const NOTIFY_UID = 'api::email-log.email-log';

/** Tronque pour un champ `string` (255) du journal. */
const trimForLog = (value: unknown, max = 200): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Vrai seulement si l'événement vient d'une requête HTTP qui n'a pas demandé
 * le silence : un script in-process (migration, seed) n'a aucun contexte de
 * requête → jamais d'envoi, exactement comme demandé.
 */
const shouldNotify = (): boolean => {
  const ctx = getCurrentCtx();
  if (!ctx) return false; // script / cron / boot : aucun envoi
  const headers = (ctx.request?.headers ?? ctx.request?.header ?? {}) as Record<string, unknown>;
  const flag = headers[NOTIFY_HEADER];
  if (flag === undefined || flag === null) return true;
  const value = Array.isArray(flag) ? flag[0] : flag;
  const normalized = String(value).toLowerCase().trim();
  return !(normalized === '1' || normalized === 'true' || normalized === 'yes');
};

/** Abonnés confirmés (les désabonnés n'existent plus en base : ils sont supprimés). */
const loadRecipients = async (): Promise<any[]> => {
  try {
    return (await strapi.documents('api::subscriber.subscriber').findMany({
      filters: { is_confirmed: true },
      fields: ['email', 'unsubscribe_token', 'langue_preferee'],
      limit: -1,
    })) as any[];
  } catch (err) {
    console.error('[notify] lecture des abonnés impossible :', (err as Error).message);
    return [];
  }
};

interface EmailLogEntry {
  publication: 'document' | 'actualite';
  titre: string;
  lien?: string | null;
  destinataires: number;
  envoyes: number;
  echecs: number;
  duree_ms?: number;
  statut: 'ok' | 'partiel' | 'echec' | 'sans_destinataire' | 'ignore';
  detail?: string | null;
}

/** Trace dans le journal d'envoi (jamais bloquant, jamais d'adresse en clair). */
const writeEmailLog = async (entry: EmailLogEntry): Promise<void> => {
  try {
    await strapi.documents(NOTIFY_UID).create({ data: entry as any });
  } catch (err) {
    console.error("[notify] journal d'envoi non enregistré :", (err as Error).message);
  }
};

const statutOf = (total: number, sent: number, failed: number): EmailLogEntry['statut'] => {
  if (total === 0) return 'sans_destinataire';
  if (failed === 0) return 'ok';
  return sent > 0 ? 'partiel' : 'echec';
};

/**
 * Réserve la publication (anti-doublon) puis, si l'envoi est autorisé, lance
 * l'envoi groupé sans jamais bloquer l'appelant.
 */
const dispatch = async (
  entity: {
    uid: 'api::document.document' | 'api::actualite.actualite';
    documentId: string;
    id: number | string;
    titre: string;
    lien: string;
    type: 'document' | 'actualite';
  }
): Promise<void> => {
  const now = new Date().toISOString();

  // 1. Anti-doublon : la publication est « consommée » avant l'envoi.
  try {
    await strapi.documents(entity.uid).update({
      documentId: entity.documentId,
      data: { notifie_le: now } as any,
    });
  } catch (err) {
    // Sans réserve fiable, on NE PAS ENVOIE (risque de doublon pire qu'un oubli).
    console.error('[notify] réservation impossible (notifie_le) :', (err as Error).message);
    return;
  }

  // 2. Silence demandé (script in-process ou en-tête x-no-notify) : tracé, zéro envoi.
  if (!shouldNotify()) {
    console.log(
      `ℹ️  [notify] ${entity.type} #${entity.id} publié SANS notification (script / x-no-notify).`
    );
    await writeEmailLog({
      publication: entity.type,
      titre: trimForLog(entity.titre),
      lien: entity.lien,
      destinataires: 0,
      envoyes: 0,
      echecs: 0,
      duree_ms: 0,
      statut: 'ignore',
      detail: 'Script in-process ou en-tête x-no-notify : aucun envoi (décision produit).',
    });
    return;
  }

  const recipients = await loadRecipients();

  // 3. Fire-and-forget : un échec d'envoi ne doit JAMAIS remettre en cause la
  //    publication ; le résumé part dans le journal + la console.
  void (async () => {
    try {
      const summary = await sendNewPublicationEmail(
        entity.type,
        entity.titre,
        entity.lien,
        recipients
      );
      await writeEmailLog({
        publication: entity.type,
        titre: trimForLog(entity.titre),
        lien: entity.lien,
        destinataires: summary.total,
        envoyes: summary.sent,
        echecs: summary.failed,
        duree_ms: summary.durationMs,
        statut: statutOf(summary.total, summary.sent, summary.failed),
        detail: summary.errors.length ? summary.errors.join(' | ') : null,
      });
    } catch (err) {
      console.error(
        `[notify] erreur d'envoi ${entity.type} #${entity.id} :`,
        (err as Error).message
      );
    }
  })();
};

/** Document : appelé par afterCreate (créé validé) et afterUpdate (passage à « validée »). */
export const notifyDocumentPublication = async (doc: any): Promise<void> => {
  if (!doc || doc.etat_notice !== 'validee' || doc.notifie_le) return;
  await dispatch({
    uid: 'api::document.document',
    documentId: doc.documentId,
    id: doc.id,
    titre: String(doc.objet ?? '').trim() || '(document sans titre)',
    lien: `${SITE_URL}/documents/${doc.id}`, // identique à /documents/:id du front (id numérique)
    type: 'document',
  });
};

/** Actualité : appelé par afterCreate uniquement (les actus n'ont pas de brouillon). */
export const notifyActualitePublication = async (actu: any): Promise<void> => {
  if (!actu || !actu.titre || actu.notifie_le) return;
  await dispatch({
    uid: 'api::actualite.actualite',
    documentId: actu.documentId,
    id: actu.id,
    titre: String(actu.titre).trim(),
    // Aucune adresse directe vers une actualité : section « Actualités » de
    // l'accueil (ancre existante #onboarding-news dans Accueil.jsx).
    lien: `${SITE_URL}/#onboarding-news`,
    type: 'actualite',
  });
};
