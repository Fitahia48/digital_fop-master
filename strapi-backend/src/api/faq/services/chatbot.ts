/**
 * Chatbot F9 — pipeline RAG + Gemini, avec repli sur le moteur à règles.
 *
 * Flux d'une question :
 *  1. récupération : FAQ (toutes locales utiles) + documents via la recherche
 *     existante (buildInternalDocs) — même politique d'accès que le reste de
 *     l'application (notices « etat_notice = validee » uniquement) ;
 *  2. injection dans le prompt système + l'historique conversationnel ;
 *  3. Gemini 2.5 Flash répond en une seule requête stateless (pas de session
 *     serveur, aucune conversation persistée) ;
 *  4. toute erreur (clé absente, quota, timeout) → repli gracieux sur le
 *     matching FAQ par règles, donc l'assistant ne tombe jamais en panne.
 *
 * Aucune conversation n'est stockée : conformité MVP (choix F9) et
 * minimisation des données personnelles.
 */
import {
  CHATBOT_SYSTEM_PROMPT,
  GEMINI_MODEL_CHAIN,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TEMPERATURE,
  GEMINI_TIMEOUT_MS,
  CHATBOT_MAX_HISTORY,
  CHATBOT_MAX_FAQ,
  CHATBOT_MAX_DOCS,
  CHATBOT_MAX_MESSAGE_LEN,
} from '../config/chatbot';
import { normalizeText } from '../../search/controllers/faq-matcher';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface FaqCtx {
  question: string | null;
  reponse: string | null;
}

interface DocCtx {
  id: number | string;
  type: string | null;
  numero: string | null;
  objet: string | null;
  date: string | null;
  status: string | null;
  domaine_nom: string | null;
  resume_simplifie: string | null;
}

export interface ChatbotResult {
  type: 'llm';
  lang: string;
  text: string;
  sources: { faq: FaqCtx[]; documents: DocCtx[] };
  used_llm: boolean;
  fallback_reason: string | null;
}

/** Limiteur en mémoire (mono-instance) — cf. CHATBOT_RATE_LIMIT. */
const rateBuckets = new Map<string, number[]>();

export const isRateLimited = (key: string, maxPerMinute: number, windowMs: number): boolean => {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxPerMinute) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  // Ménage périodique pour éviter une croissance sans borne
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t >= windowMs)) rateBuckets.delete(k);
    }
  }
  return false;
};

/** FAQ localisées : locale demandée d'abord, puis repli sur les autres. */
export const collectFaqContext = async (
  locale: string,
  max: number
): Promise<FaqCtx[]> => {
  const UID = 'api::faq.faq';
  const out: FaqCtx[] = [];
  for (const l of locale === 'fr' ? ['fr', 'en'] : [locale, 'fr', 'en'].filter((v, i, a) => a.indexOf(v) === i)) {
    let rows: any[] = [];
    try {
      rows = (await strapi.documents(UID).findMany({
        locale: l,
        sort: [{ ordre: 'asc' }],
        limit: max,
      })) as any[];
    } catch {
      continue;
    }
    for (const r of rows) {
      if (r.question && r.reponse) {
        out.push({ question: r.question, reponse: r.reponse });
      }
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
};

/** Documents pertinents : réutilise la recherche interne (notices validées). */
export const collectDocContext = async (
  query: string
): Promise<DocCtx[]> => {
  const { buildInternalDocs } = await import('../../search/controllers/search');
  const internal = await buildInternalDocs(query, { page: 1, page_size: CHATBOT_MAX_DOCS });
  return (internal.results || []).map((d: any) => ({
    id: d.id,
    type: d.type ?? null,
    numero: d.numero ?? null,
    objet: d.objet ?? null,
    date: d.date ?? null,
    status: d.status ?? null,
    domaine_nom: d.domaine_nom ?? null,
    resume_simplifie: d.resume_simplifie
      ? String(d.resume_simplifie).slice(0, 600)
      : null,
  }));
};

/** Construit le bloc « sources » injecté avant la question de l'usager. */
export const buildContextBlock = (faq: FaqCtx[], docs: DocCtx[]): string => {
  const parts: string[] = [];
  if (faq.length > 0) {
    const faqLines = faq
      .map((f, i) => `- [FAQ${i + 1}] ${f.question}\n  ${f.reponse}`)
      .join('\n');
    parts.push(`FAQ de la bibliothèque :\n${faqLines}`);
  }
  if (docs.length > 0) {
    const docLines = docs
      .map((d, i) => {
        const bits = [
          `id=${d.id}`,
          d.type ? `type=${d.type}` : null,
          d.numero ? `n°=${d.numero}` : null,
          d.date ? `date=${d.date}` : null,
          d.status ? `statut=${d.status}` : null,
          d.domaine_nom ? `domaine=${d.domaine_nom}` : null,
        ]
          .filter(Boolean)
          .join(', ');
        return `- [DOC${i + 1}] ${bits}\n  Objet : ${d.objet ?? '(sans objet)'}${
          d.resume_simplifie ? `\n  Résumé : ${d.resume_simplifie}` : ''
        }`;
      })
      .join('\n');
    parts.push(`Notices documentaires pertinentes (validées, publiquement accessibles) :\n${docLines}`);
  }
  return parts.length > 0
    ? `Voici les seules sources fiables dont tu disposes pour cette demande :\n\n${parts.join('\n\n')}`
    : 'Aucune source n’a pu être trouvée dans la bibliothèque pour cette demande. Indique-le clairement à l’usager et propose-lui la marche à suivre (formulation plus simple, recherche par numéro, ou contact du service compétent si ses coordonnées figurent dans l’application).';
};

/**
 * Appel REST Gemini (pas de SDK : dépendance zéro, timeout natif via AbortController).
 * Chaîne de modèles : le premier qui répond gagne (503 / indisponibilité →
 * modèle suivant). Retourne le texte de réponse, ou lève une erreur.
 */
export const callGemini = async (
  userText: string,
  history: ChatTurn[],
  contextBlock: string,
  lang: string
): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY manquante');

  const chain = process.env.GEMINI_MODEL
    ? [process.env.GEMINI_MODEL]
    : GEMINI_MODEL_CHAIN;

  const langName = { fr: 'français', en: 'anglais', mg: 'malgache' }[lang] || 'français';

  const systemInstruction = `${CHATBOT_SYSTEM_PROMPT}

## Contexte de session
- Langue préférée de l'usager : ${langName} (réponds dans sa langue effective s'il change).
- Chaque tour d'usager est précédé d'un bloc « sources » : base-toi sur ces seules informations pour les questions factuelles. Les références [FAQn] / [DOCn] peuvent être citées telles quelles.`;

  const contents = [
    // Historique récent (alternance stricte user/model exigée par Gemini)
    ...history.slice(-CHATBOT_MAX_HISTORY).map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(turn.content || '').slice(0, CHATBOT_MAX_MESSAGE_LEN) }],
    })),
    {
      role: 'user',
      parts: [{ text: `${contextBlock}\n\n---\nQuestion de l'usager : ${userText}` }],
    },
  ];

  let lastError: Error | null = null;
  for (const model of chain) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: GEMINI_TEMPERATURE,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 404 : modèle non provisionné (inutile de le retenir) — on passe au
        // suivant sans bruit. 429/5xx : surcharge/quota temporaire.
        throw new Error(`Gemini ${model} ${res.status}: ${body.slice(0, 200)}`);
      }
      const data: any = await res.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join('');
      if (!text || !text.trim()) throw new Error('Gemini : réponse vide (contenu bloqué ?)');
      return text.trim().slice(0, 4000);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[chatbot] ${lastError.message}`);
      // AbortController (timeout) ou erreur réseau : on tente le modèle suivant.
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('Gemini : aucun modèle disponible');};

/**
 * Point d'entrée : répond à un message usager.
 * @returns réponse LLM si possible, sinon repli règles (used_llm=false).
 */
export const answerUserMessage = async (
  message: string,
  history: ChatTurn[],
  lang: string
): Promise<ChatbotResult> => {
  const text = String(message || '').trim().slice(0, CHATBOT_MAX_MESSAGE_LEN);
  const code = ['fr', 'en', 'mg'].includes(lang) ? lang : 'fr';

  const emptyResult: ChatbotResult = {
    type: 'llm',
    lang: code,
    text: '',
    sources: { faq: [], documents: [] },
    used_llm: false,
    fallback_reason: null,
  };
  if (!text) return { ...emptyResult, text: '' };

  // 1. Récupération (FAQ + documents)
  const [faqCtx, docCtx] = await Promise.all([
    collectFaqContext(code, CHATBOT_MAX_FAQ),
    collectDocContext(normalizeText(text) || text),
  ]);
  const sources = { faq: faqCtx, documents: docCtx };

  // 2. LLM
  if (process.env.GEMINI_API_KEY) {
    try {
      const contextBlock = buildContextBlock(faqCtx, docCtx);
      const reply = await callGemini(text, history, contextBlock, code);
      return { ...emptyResult, text: reply, sources, used_llm: true };
    } catch (err: any) {
      console.error('[chatbot] Gemini error:', err?.message || err);
      // Repli volontaire — jamais d'échec visible côté usager
    }
  }

  // 3. Repli : moteur à règles existant (matching FAQ flou + recherche docs)
  const { matchFaqOrDocuments } = await import('../../search/controllers/search');
  const legacy = await matchFaqOrDocuments(text, code);
  return {
    type: 'llm',
    lang: code,
    text: '',
    sources: {
      faq: legacy?.faq
        ? [{ question: legacy.faq.question, reponse: legacy.faq.reponse }]
        : faqCtx.slice(0, 1),
      documents: (legacy?.documents || []).slice(0, CHATBOT_MAX_DOCS).map((d: any) => ({
        id: d.id,
        type: d.type ?? null,
        numero: d.numero ?? null,
        objet: d.objet ?? null,
        date: d.date ?? null,
        status: d.status ?? null,
        domaine_nom: d.domaine_nom ?? null,
        resume_simplifie: null,
      })),
    },
    used_llm: false,
    fallback_reason: process.env.GEMINI_API_KEY ? 'llm_error' : 'no_api_key',
  };
};

// Strapi charge l'export `default` des services (`importDefault`) : sans lui,
// le fichier n'est PAS enregistré (même contrainte que les contrôleurs).
export default {
  isRateLimited,
  collectFaqContext,
  collectDocContext,
  buildContextBlock,
  callGemini,
  answerUserMessage,
};
