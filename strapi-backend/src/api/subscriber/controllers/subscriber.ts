/**
 * Extensions du controller subscriber (portage de subscribers.controller.js).
 *
 * - POST /api/subscribers/subscribe           : public, envoie le mail de confirmation
 * - GET  /api/subscribers/confirm/:token      : confirme l'abonnement
 * - GET  /api/subscribers/unsubscribe/:token  : supprime l'abonné + mail de confirmation
 */
import { factories } from '@strapi/strapi';
import crypto from 'crypto';
import {
  sendConfirmationEmail,
  sendUnsubscribeConfirmationEmail,
  MAILER_ENABLED,
} from '../../../utils/mailer';
import { resolveRequestLang, resolveLang } from '../../../utils/email-templates';
import { ValidationError } from '../../../utils/errors';
import { isAdminCtx } from '../../../utils/roles';
import { maskEmail } from '../../../utils/mailer';

// ─── Espace administration des abonnés (réservé aux administrateurs) ───────
// Même discipline que statistics.ts / transparence.ts : routes SANS auth:false
// (l'authentification est exigée par le routeur) + contrôle admin ici — jamais
// de dépendance à une permission U&P seule pour protéger des données perso.
// Aucun jeton (confirm_token / unsubscribe_token) n'est renvoyé ni journalisé.

const SORTS: Record<string, { field: 'createdAt' | 'email'; order: 'asc' | 'desc' }> = {
  date_desc: { field: 'createdAt', order: 'desc' },
  date_asc: { field: 'createdAt', order: 'asc' },
  email_asc: { field: 'email', order: 'asc' },
};
const STATUTS = ['tous', 'confirmes', 'en_attente'] as const;
const LANGUES = ['fr', 'en', 'mg'] as const;

type ListQuery = {
  search?: string;
  statut?: string;
  langue?: string;
  sort?: string;
  page?: string;
  page_size?: string;
};

/** 401 si non connecté, 403 si non admin — puis le ctx admin ou null. */
const requireAdmin = async (ctx: any): Promise<boolean> => {
  if (!ctx?.state?.user) {
    ctx.status = 401;
    ctx.body = {
      data: null,
      error: { status: 401, name: 'UnauthorizedError', message: 'Authentification requise.' },
    };
    return false;
  }
  if (!(await isAdminCtx(ctx))) {
    ctx.status = 403;
    ctx.body = {
      data: null,
      error: { status: 403, name: 'ForbiddenError', message: 'Accès réservé aux administrateurs.' },
    };
    return false;
  }
  return true;
};

/** Filtres communs liste/export — validés (statut/langue/ttri) + recherche email. */
const buildListFilters = (query: ListQuery) => {
  const filters: Record<string, any> = {};
  const search = String(query.search || '').trim();
  if (search) filters.email = { $containsi: search };
  const statut = String(query.statut || 'tous');
  if (!STATUTS.includes(statut as any)) {
    throw new ValidationError('Paramètre « statut» invalide (tous | confirmes | en_attente).');
  }
  if (statut === 'confirmes') filters.is_confirmed = { $eq: true };
  if (statut === 'en_attente') filters.is_confirmed = { $eq: false };
  const langue = String(query.langue || '');
  if (langue) {
    if (!LANGUES.includes(langue as any)) {
      throw new ValidationError('Paramètre « langue » invalide (fr | en | mg).');
    }
    filters.langue_preferee = { $eq: langue };
  }
  const sortKey = String(query.sort || 'date_desc');
  if (!SORTS[sortKey]) throw new ValidationError('Paramètre « sort » invalide (date_desc | date_asc | email_asc).');
  return { filters, sort: SORTS[sortKey] };
};

/** Projection sûre : JAMAIS confirm_token / unsubscribe_token. */
const toListItem = (row: any) => ({
  id: row.documentId,
  email: row.email,
  is_confirmed: Boolean(row.is_confirmed),
  langue_preferee: row.langue_preferee || 'fr',
  createdAt: row.createdAt,
});

/** Chiffre CSV : apostrophe devant = + - @ (injection de formule Excel/Sheets). */
const csvCell = (value: unknown): string => {
  const raw = value == null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Codes machine côté API (le `detail` reste la phrase lisible) :
// email_sent=true  → SUBSCRIPTION_CONFIRMATION_SENT, CONFIRMATION_RESENT
// email_sent=false → ALREADY_SUBSCRIBED (aucun mail envoyé, cas nominal),
//                    CONFIRMATION_EMAIL_FAILED, MAILER_DISABLED
const MAIL_FAILED_DETAIL =
  "Inscription enregistrée mais l'e-mail de confirmation n'a pas pu être envoyé. Réessayez plus tard.";

/**
 * Envoie le mail de confirmation et renvoie un booléen de succès.
 * N'échoue jamais (le mailer ne rejette pas) : log + ok=false sinon.
 */
const trySendConfirmation = async (
  email: string,
  token: string,
  lang: string
): Promise<boolean> => {
  if (!MAILER_ENABLED) {
    console.warn(
      `Mailer INACTIF : e-mail de confirmation non envoyé à ${email} (SMTP non configuré).`
    );
    return false;
  }
  try {
    return await sendConfirmationEmail(email, token, lang);
  } catch (err) {
    console.error('Mailer confirm error:', (err as Error).message);
    return false;
  }
};

export default factories.createCoreController('api::subscriber.subscriber', () => ({
  // GET /api/subscribers/admin/list — admin uniquement
  async adminList(ctx: any) {
    try {
      if (!(await requireAdmin(ctx))) return;
      const query = (ctx.query || {}) as ListQuery;
      const { filters, sort } = buildListFilters(query);
      const page = Math.max(1, parseInt(String(query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(query.page_size || '20'), 10) || 20));

      const doc = strapi.documents('api::subscriber.subscriber');
      const [rows, total, cTotal, cConfirmes, cFr, cEn, cMg] = await Promise.all([
        doc.findMany({
          filters,
          sort: [{ [sort.field]: sort.order }],
          start: (page - 1) * pageSize,
          limit: pageSize,
        }),
        doc.count({ filters }),
        doc.count({}),
        doc.count({ filters: { is_confirmed: { $eq: true } } }),
        doc.count({ filters: { langue_preferee: { $eq: 'fr' } } }),
        doc.count({ filters: { langue_preferee: { $eq: 'en' } } }),
        doc.count({ filters: { langue_preferee: { $eq: 'mg' } } }),
      ]);

      ctx.body = {
        data: (rows as any[]).map(toListItem),
        meta: {
          total,
          page,
          page_size: pageSize,
          page_count: Math.max(1, Math.ceil(total / pageSize)),
        },
        counters: {
          total: cTotal,
          confirmes: cConfirmes,
          en_attente: cTotal - cConfirmes,
          par_langue: { fr: cFr, en: cEn, mg: cMg },
        },
      };
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('adminList subscribers error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // GET /api/subscribers/admin/export — CSV (UTF-8 + BOM), mêmes filtres
  async adminExport(ctx: any) {
    try {
      if (!(await requireAdmin(ctx))) return;
      const query = (ctx.query || {}) as ListQuery;
      const { filters, sort } = buildListFilters(query);
      const rows = (await strapi.documents('api::subscriber.subscriber').findMany({
        filters,
        sort: [{ [sort.field]: sort.order }],
        limit: 1000, // garde-fou : export borné, pas d'extraction illimitée
      })) as any[];

      const header = ['Email', 'Statut', 'Langue', "Date d'inscription"];
      const lines = rows.map((r) =>
        [
          csvCell(r.email),
          csvCell(r.is_confirmed ? 'Confirmé' : 'En attente'),
          csvCell(r.langue_preferee || 'fr'),
          csvCell(new Date(r.createdAt).toISOString().slice(0, 10)),
        ].join(';')
      );
      // BOM UTF-8 : Excel détecte les accents ; ';' : séparateur Excel FR.
      const csv = `\uFEFF${header.map(csvCell).join(';')}\r\n${lines.join('\r\n')}\r\n`;

      ctx.set('Content-Type', 'text/csv; charset=utf-8');
      ctx.set(
        'Content-Disposition',
        `attachment; filename="abonnes-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      ctx.body = csv;
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('adminExport subscribers error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // DELETE /api/subscribers/admin/:id — retrait d'un abonné (admin uniquement).
  // :id = documentId. Pas de modification possible (aucune route update admin).
  async adminDelete(ctx: any) {
    try {
      if (!(await requireAdmin(ctx))) return;
      const documentId = String(ctx.params?.id || '');
      const doc = strapi.documents('api::subscriber.subscriber');
      const existing = (await doc.findOne({ documentId })) as any;
      if (!existing) return ctx.notFound('Abonné introuvable.');

      await doc.delete({ documentId });
      // Journal d'audit : adresse MASQUÉE uniquement, jamais de jeton.
      const adminId = ctx.state.user?.id ?? '?';
      console.log(
        `[admin] Abonné supprimé : ${maskEmail(existing.email)} (par admin #${adminId})`
      );
      ctx.body = { detail: 'Abonné supprimé. Il ne recevra plus d’alertes.', id: documentId };
    } catch (err) {
      console.error('adminDelete subscriber error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // POST /api/subscribers/subscribe
  async subscribe(ctx: any) {
    try {
      const { email, langue_preferee } = ctx.request.body || {};
      if (!email || !isValidEmail(email)) {
        throw new ValidationError('Adresse email invalide.');
      }
      const normalized = String(email).trim().toLowerCase();
      const langue = resolveRequestLang(ctx, langue_preferee);

      const existing = (await strapi.documents('api::subscriber.subscriber').findMany({
        filters: { email: { $eqi: normalized } },
        limit: 1,
      })) as any[];

      if (existing.length > 0) {
        const sub = existing[0];
        if (sub.is_confirmed) {
          ctx.status = 200;
          ctx.body = {
            detail: 'Cet email est déjà abonné. Vous recevrez les prochaines publications.',
            code: 'ALREADY_SUBSCRIBED',
            email_sent: false,
          };
          return;
        }
        const confirm_token = crypto.randomUUID();
        await strapi.documents('api::subscriber.subscriber').update({
          documentId: sub.documentId,
          data: { confirm_token, langue_preferee: langue },
        });
        const sent = await trySendConfirmation(normalized, confirm_token, langue);
        ctx.status = 200;
        ctx.body = sent
          ? {
              detail: 'Un nouveau mail de confirmation a été envoyé à votre adresse.',
              code: 'CONFIRMATION_RESENT',
              email_sent: true,
            }
          : {
              detail: MAIL_FAILED_DETAIL,
              code: 'CONFIRMATION_EMAIL_FAILED',
              email_sent: false,
            };
        return;
      }

      const confirm_token = crypto.randomUUID();
      const unsubscribe_token = crypto.randomUUID();
      await strapi.documents('api::subscriber.subscriber').create({
        data: {
          email: normalized,
          langue_preferee: langue,
          is_confirmed: false,
          confirm_token,
          unsubscribe_token,
        },
      });

      const sent = await trySendConfirmation(normalized, confirm_token, langue);
      if (!sent) {
        // Honnêteté : l'abonné EST conservé (non confirmé) — un nouvel essai
        // régénère le jeton et renvoie le mail, comme avant.
        ctx.status = 201;
        ctx.body = {
          detail: MAIL_FAILED_DETAIL,
          code: MAILER_ENABLED ? 'CONFIRMATION_EMAIL_FAILED' : 'MAILER_DISABLED',
          email_sent: false,
        };
        return;
      }
      ctx.status = 201;
      ctx.body = {
        detail: 'Inscription prise en compte. Vérifiez votre boîte mail pour confirmer votre abonnement.',
        code: 'SUBSCRIPTION_CONFIRMATION_SENT',
        email_sent: true,
      };
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('subscribe error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // GET /api/subscribers/confirm/:token
  async confirmSubscription(ctx: any) {
    try {
      const { token } = ctx.params;
      const rows = (await strapi.documents('api::subscriber.subscriber').findMany({
        filters: { confirm_token: { $eq: token }, is_confirmed: { $eq: false } },
        limit: 1,
      })) as any[];

      if (rows.length === 0) {
        return ctx.badRequest('Lien de confirmation invalide ou déjà utilisé.');
      }

      await strapi.documents('api::subscriber.subscriber').update({
        documentId: rows[0].documentId,
        data: { is_confirmed: true, confirm_token: null as any },
      });

      ctx.body = { detail: 'Votre abonnement a bien été confirmé. Merci !' };
    } catch (err) {
      console.error('confirmSubscription error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // GET /api/subscribers/unsubscribe/:token
  async unsubscribe(ctx: any) {
    try {
      const { token } = ctx.params;
      const rows = (await strapi.documents('api::subscriber.subscriber').findMany({
        filters: { unsubscribe_token: { $eq: token } },
        limit: 1,
      })) as any[];

      if (rows.length === 0) {
        return ctx.notFound('Lien de désabonnement invalide.');
      }

      const { email, langue_preferee } = rows[0];
      await strapi.documents('api::subscriber.subscriber').delete({
        documentId: rows[0].documentId,
      });

      sendUnsubscribeConfirmationEmail(email, resolveLang(langue_preferee)).catch((err) =>
        console.error('Mailer unsubscribe error:', (err as Error).message)
      );

      ctx.body = { detail: "Vous avez bien été désabonné. Vous ne recevrez plus d'alertes." };
    } catch (err) {
      console.error('unsubscribe error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },
}));
