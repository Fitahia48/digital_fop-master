/**
 * Controller faq.
 *
 * - Forme **legacy** (portée de backend/src/controllers/faq.controller.js) :
 *   la FAQ Strapi est localisée (i18n) alors que le legacy exposait 6 colonnes
 *   `question_fr/en/mg` + `reponse_fr/en/mg`. On agrège les 3 locales d'un même
 *   document et on aplatit à la lecture, et on répartit à l'écriture.
 *   Routes : `/api/faq/`, `/api/faq/:id/` (faq-custom.ts) — chemins distincts
 *   du core (`/faqs`), donc sans collision.
 * - POST /api/faq/ask — question en langage naturel (public, chatbot F9).
 */
import { factories } from '@strapi/strapi';
import { matchFaqOrDocuments } from '../../search/controllers/search';
import { MAX_QUESTION_LEN } from '../../search/controllers/faq-matcher';
import { ValidationError } from '../../../utils/errors';
import { findOneByRef } from '../../../utils/by-ref';
import chatbotService from '../services/chatbot';
import { CHATBOT_RATE_LIMIT, CHATBOT_MAX_MESSAGE_LEN } from '../config/chatbot';

const UID = 'api::faq.faq';
const TRANSLATION_LOCALES = ['en', 'mg'];

/** Aplati un document FAQ (3 locales) vers la forme legacy à 6 champs. */
const flattenFaq = (byLocale: Record<string, any>) => {
  const base = byLocale.fr ?? byLocale.en ?? byLocale.mg ?? {};
  return {
    id: base.id,
    question_fr: byLocale.fr?.question ?? null,
    question_en: byLocale.en?.question ?? null,
    question_mg: byLocale.mg?.question ?? null,
    reponse_fr: byLocale.fr?.reponse ?? null,
    reponse_en: byLocale.en?.reponse ?? null,
    reponse_mg: byLocale.mg?.reponse ?? null,
    categorie: base.categorie ?? null,
    ordre: base.ordre ?? 0,
    created_at: base.createdAt ?? null,
  };
};

/** Récupère tous les documents FAQ regroupés par documentId, toutes locales. */
const collectFaqsByDocument = async (): Promise<Map<string, Record<string, any>>> => {
  const byDocument = new Map<string, Record<string, any>>();
  for (const locale of ['fr', ...TRANSLATION_LOCALES]) {
    let rows: any[] = [];
    try {
      rows = (await strapi.documents(UID).findMany({ locale, limit: -1 })) as any[];
    } catch {
      // Locale non encore créée côté i18n : on l'ignore.
      continue;
    }
    for (const row of rows) {
      const entry = byDocument.get(row.documentId) ?? {};
      entry[locale] = row;
      byDocument.set(row.documentId, entry);
    }
  }
  return byDocument;
};

export default factories.createCoreController(UID, () => ({
  // GET /api/faq/ (+ ?categorie=) — formes fr/en/mg aplaties
  async find(ctx: any) {
    try {
      const { categorie } = ctx.query || {};
      const byDocument = await collectFaqsByDocument();

      let results = Array.from(byDocument.values()).map(flattenFaq);
      if (categorie) results = results.filter((r) => r.categorie === categorie);
      results.sort((a, b) => (a.ordre - b.ordre) || (a.id - b.id));

      ctx.body = { count: results.length, results };
    } catch (err) {
      console.error('[faq] find:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // POST /api/faq/ (admin) — FR obligatoire, en/mg facultatifs
  async create(ctx: any) {
    try {
      const b = ctx.request.body || {};
      const question_fr = String(b.question_fr ?? '').trim();
      const reponse_fr = String(b.reponse_fr ?? '').trim();
      if (!question_fr || !reponse_fr) {
        throw new ValidationError('La question et la réponse en français sont obligatoires.');
      }
      const ordre = Number.isFinite(parseInt(b.ordre, 10)) ? parseInt(b.ordre, 10) : 0;

      const created = (await strapi.documents(UID).create({
        locale: 'fr',
        data: {
          question: question_fr,
          reponse: reponse_fr,
          categorie: String(b.categorie ?? '').trim() || null,
          ordre,
        } as any,
      })) as any;

      // Traductions : update() sur une locale absente crée la variante liée.
      for (const locale of TRANSLATION_LOCALES) {
        const question = String(b[`question_${locale}`] ?? '').trim();
        const reponse = String(b[`reponse_${locale}`] ?? '').trim();
        if (!question && !reponse) continue;
        await strapi.documents(UID).update({
          documentId: created.documentId,
          locale,
          data: { question: question || question_fr, reponse: reponse || reponse_fr } as any,
        });
      }

      ctx.status = 201;
      ctx.body = {
        id: created.id,
        question_fr,
        question_en: String(b.question_en ?? '').trim() || null,
        question_mg: String(b.question_mg ?? '').trim() || null,
        reponse_fr,
        reponse_en: String(b.reponse_en ?? '').trim() || null,
        reponse_mg: String(b.reponse_mg ?? '').trim() || null,
        categorie: String(b.categorie ?? '').trim() || null,
        ordre,
      };
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('[faq] create:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // PUT/PATCH /api/faq/:id/ (admin) — mise à jour partielle
  async update(ctx: any) {
    try {
      const current = await findOneByRef(UID, ctx.params.documentId ?? ctx.params.id);
      if (!current) return ctx.notFound('Question FAQ introuvable.');

      const b = ctx.request.body || {};

      // Locale par défaut (fr) : catégorie / ordre (non localisés) + question/réponse
      const frData: Record<string, any> = {};
      if (b.question_fr !== undefined) {
        const v = String(b.question_fr).trim();
        if (!v) throw new ValidationError('La question en français ne peut pas être vide.');
        frData.question = v;
      }
      if (b.reponse_fr !== undefined) {
        const v = String(b.reponse_fr).trim();
        if (!v) throw new ValidationError('La réponse en français ne peut pas être vide.');
        frData.reponse = v;
      }
      if (b.categorie !== undefined) frData.categorie = String(b.categorie).trim() || null;
      if (b.ordre !== undefined) frData.ordre = Number.isFinite(parseInt(b.ordre, 10)) ? parseInt(b.ordre, 10) : 0;

      if (Object.keys(frData).length > 0) {
        await strapi.documents(UID).update({
          documentId: current.documentId,
          locale: 'fr',
          data: frData as any,
        });
      }

      // Traductions en/mg : on n'écrit que les valeurs renseignées (champs requis)
      for (const locale of TRANSLATION_LOCALES) {
        const data: Record<string, any> = {};
        const question = String(b[`question_${locale}`] ?? '').trim();
        const reponse = String(b[`reponse_${locale}`] ?? '').trim();
        if (question) data.question = question;
        if (reponse) data.reponse = reponse;
        if (Object.keys(data).length === 0) continue;
        await strapi.documents(UID).update({
          documentId: current.documentId,
          locale,
          data: data as any,
        });
      }

      const byDocument = await collectFaqsByDocument();
      ctx.body = flattenFaq(byDocument.get(current.documentId) ?? { fr: current });
    } catch (err) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('[faq] update:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // DELETE /api/faq/:id/ (admin) — supprime le document et toutes ses locales
  async delete(ctx: any) {
    try {
      const current = await findOneByRef(UID, ctx.params.documentId ?? ctx.params.id);
      if (!current) return ctx.notFound('Question FAQ introuvable.');
      await strapi.documents(UID).delete({ documentId: current.documentId });
      ctx.body = { detail: 'Question FAQ supprimée.' };
    } catch (err) {
      console.error('[faq] delete:', (err as Error).message);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },

  // POST /api/faq/ask — question en langage naturel (public, chatbot F9)
  // Réponse LLM (RAG : FAQ + notices validées) si GEMINI_API_KEY est définie,
  // sinon repli transparent sur le moteur à règles (matching FAQ + recherche).
  async ask(ctx: any) {
    try {
      const b = ctx.request.body || {};
      const question = String(b.question ?? '').trim();
      const lang = String(b.lang ?? 'fr');
      const history = Array.isArray(b.history) ? b.history : [];

      if (!question) {
        throw new ValidationError('La question est obligatoire.');
      }
      if (question.length > Math.max(MAX_QUESTION_LEN, CHATBOT_MAX_MESSAGE_LEN)) {
        throw new ValidationError(
          `La question ne peut pas dépasser ${Math.max(MAX_QUESTION_LEN, CHATBOT_MAX_MESSAGE_LEN)} caractères.`
        );
      }

      // Rate limit par IP : au-delà de la limite, on court-circuite le LLM
      // (coût) mais on répond quand même via le moteur à règles.
      const ip = String(ctx.ip || ctx.request?.ip || 'anon');
      const limited = chatbotService.isRateLimited(
        `ask:${ip}`,
        CHATBOT_RATE_LIMIT.maxPerMinute,
        CHATBOT_RATE_LIMIT.windowMs
      );

      if (!limited && process.env.GEMINI_API_KEY) {
        const result = await chatbotService.answerUserMessage(question, history, lang);
        if (result.used_llm && result.text) {
          ctx.body = {
            type: 'llm',
            lang: result.lang,
            text: result.text,
            sources: result.sources,
          };
          return;
        }
      }

      // Moteur à règles (sans clé, quota dépassé ou LLM indisponible)
      ctx.body = await matchFaqOrDocuments(question, lang);
    } catch (err: any) {
      if (err instanceof ValidationError) return ctx.badRequest(err.message);
      console.error('askFaq error:', err);
      return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
    }
  },
}));
