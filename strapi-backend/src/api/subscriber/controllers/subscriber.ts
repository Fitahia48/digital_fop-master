/**
 * Extensions du controller subscriber (portage de subscribers.controller.js).
 *
 * - POST /api/subscribers/subscribe           : public, envoie le mail de confirmation
 * - GET  /api/subscribers/confirm/:token      : confirme l'abonnement
 * - GET  /api/subscribers/unsubscribe/:token  : supprime l'abonné + mail de confirmation
 */
import { factories } from '@strapi/strapi';
import crypto from 'crypto';
import { sendConfirmationEmail, sendUnsubscribeConfirmationEmail } from '../../../utils/mailer';
import { resolveRequestLang, resolveLang } from '../../../utils/email-templates';
import { ValidationError } from '../../../utils/errors';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default factories.createCoreController('api::subscriber.subscriber', () => ({
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
          ctx.body = { detail: 'Cet email est déjà abonné. Vous recevrez les prochaines publications.' };
          return;
        }
        const confirm_token = crypto.randomUUID();
        await strapi.documents('api::subscriber.subscriber').update({
          documentId: sub.documentId,
          data: { confirm_token, langue_preferee: langue },
        });
        sendConfirmationEmail(normalized, confirm_token, langue).catch((err) =>
          console.error('Mailer confirm error:', (err as Error).message)
        );
        ctx.status = 200;
        ctx.body = { detail: 'Un nouveau mail de confirmation a été envoyé à votre adresse.' };
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

      sendConfirmationEmail(normalized, confirm_token, langue).catch((err) =>
        console.error('Mailer confirm error:', (err as Error).message)
      );

      ctx.status = 201;
      ctx.body = { detail: 'Inscription prise en compte. Vérifiez votre boîte mail pour confirmer votre abonnement.' };
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
