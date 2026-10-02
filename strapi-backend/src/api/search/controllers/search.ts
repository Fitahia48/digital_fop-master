/**
 * Recherche custom (portage de backend/src/controllers/search.controller.js).
 *
 * Endpoints :
 * - POST /api/search          : recherche interne + Google PSE (auth facultative)
 * - GET  /api/search/history  : historique de l'usager connecté
 *
 * La recherche documentaire utilise le Document Service API de Strapi 5
 * (pas de SQL brut) et fusionne les résultats avec une FAQ éventuelle via
 * `matchFaqOrDocuments` (réutilisée par faq.ask).
 */
import { ApplicationError, getRequestUser } from '../../../utils/errors';
import { bestFaqMatch, pickSearchTerms } from './faq-matcher';

// Statuts acceptés par le filtre (valeurs normalisées — D8 : sans accents)
const STATUS_MAP: Record<string, string> = {
  en_vigueur: 'en_vigueur',
  'en vigueur': 'en_vigueur',
  vigueur: 'en_vigueur',
  abroge: 'abroge',
  'abrogé': 'abroge',
  modifie: 'modifie',
  'modifié': 'modifie',
  non_verifie: 'non_verifie',
  'non verifie': 'non_verifie',
  'non vérifié': 'non_verifie',
};

const LANGUES = ['fr', 'en', 'mg'];

interface InternalSearchOpts {
  page?: number | string;
  page_size?: number | string;
  type?: string;
  domaine?: string | number;
  status?: string;
}

/**
 * Recherche interne (documents MTeFOP) via le Document Service API.
 *
 * Strapi ne proposant pas nativement le tri de pertinence maison
 * (correspondance exacte sur numero → préfixe → objet → type → autres),
 * on récupère les candidats filtrés puis on applique le même classement
 * en mémoire (les volumes visés restent compatibles avec cette approche).
 *
 * @returns {{ results: Array, total: number, page: number, page_size: number, has_more: boolean }}
 */
export const buildInternalDocs = async (query: string, opts: InternalSearchOpts = {}) => {
  const empty = { results: [] as any[], total: 0, page: 1, page_size: 20, has_more: false };
  try {
    const { type, domaine, status } = opts;
    const page = Math.max(parseInt(String(opts.page ?? 1), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(opts.page_size ?? 20), 10) || 20, 1), 50);

    const filters: Record<string, any> = {
      $and: [{ etat_notice: 'validee' }],
      $or: [
        { objet: { $containsi: query } },
        { numero: { $containsi: query } },
        { type: { $containsi: query } },
      ],
    };
    if (type) filters.type = { $containsi: type };
    if (domaine) filters.domaine = { id: domaine };
    if (status) {
      const normalizedStatus = STATUS_MAP[String(status).toLowerCase().trim()];
      if (normalizedStatus) filters.status = normalizedStatus;
    }

    const rows = await strapi.documents('api::document.document').findMany({
      filters,
      populate: ['domaine'],
      limit: -1,
    });

    const q = String(query).toLowerCase();
    const rank = (d: any): number => {
      const numero = String(d.numero || '').toLowerCase();
      const objet = String(d.objet || '').toLowerCase();
      const docType = String(d.type || '').toLowerCase();
      if (numero === q) return 0;
      if (numero.startsWith(q)) return 1;
      if (objet === q) return 2;
      if (docType === q) return 3;
      return 4;
    };
    const dateOf = (d: any) => (d.date ? new Date(d.date).getTime() : 0);
    rows.sort((a: any, b: any) => rank(a) - rank(b) || dateOf(b) - dateOf(a));

    // Aplatir domaine → domaine_nom (format attendu par le front)
    const flat = rows.map((d: any) => ({
      ...d,
      domaine_nom: d.domaine?.nom ?? null,
    }));

    const total = flat.length;
    const offset = (page - 1) * pageSize;
    return {
      results: flat.slice(offset, offset + pageSize),
      total,
      page,
      page_size: pageSize,
      has_more: offset + pageSize < total,
    };
  } catch (err) {
    console.error('Erreur recherche interne:', err);
    return empty;
  }
};

/**
 * Recherche conversationnelle simple (F9 — chatbot / FAQ).
 *
 * 1. Score les FAQ de la langue courante (matching flou par tokens, insensible
 *    aux accents — cf. faq-matcher.ts).
 * 2. Sinon, élargit aux 3 langues FAQ (mieux vaut une réponse que rien).
 * 3. Sinon, retombe sur la recherche documentaire existante (buildInternalDocs),
 *    d'abord avec la requête complète puis avec les tokens les plus discriminants.
 *
 * Aucun LLM externe : scoring maison + recherche documentaire existante.
 */
export const matchFaqOrDocuments = async (query: string, lang: string) => {
  const raw = String(query || '').trim();

  let code = String(lang || '').slice(0, 2).toLowerCase();
  if (!LANGUES.includes(code)) code = 'fr';

  const empty = {
    type: 'documents',
    lang: code,
    faq: null,
    documents: [] as any[],
    documentsCount: 0,
    has_pertinence: false,
  };
  if (!raw) return empty;

  try {
    // FAQ de la locale demandée, puis repli multi-langue (i18n natif — D1)
    const locales = [code, ...LANGUES.filter((l) => l !== code)];
    for (const locale of locales) {
      let faqRows: any[] = [];
      try {
        faqRows = (await strapi.documents('api::faq.faq').findMany({
          locale,
          sort: [{ ordre: 'asc' }],
          limit: -1,
        })) as any[];
      } catch {
        // Locale non encore créée côté i18n : on passe à la suivante.
        continue;
      }

      const match = bestFaqMatch(faqRows, raw);
      if (match) {
        const row = match.faq;
        return {
          type: 'faq',
          lang: code,
          faq: {
            id: row.id,
            question: row.question,
            reponse: row.reponse,
            categorie: row.categorie,
          },
          documents: [],
          documentsCount: 0,
          has_pertinence: true,
        };
      }
      // Sinon on passe à la langue suivante (repli multi-langue).
    }

    // Repli : recherche documentaire existante
    let internal = await buildInternalDocs(raw, { page: 1, page_size: 5 });

    // Question longue en langage naturel : retenter avec les tokens les plus
    // discriminants (le plus long d'abord — cf. pickSearchTerms).
    if (internal.total === 0) {
      const { primary, tokens } = pickSearchTerms(raw);
      if (primary && primary !== raw.toLowerCase()) {
        internal = await buildInternalDocs(primary, { page: 1, page_size: 5 });
      }
      // Dernière chance : combiner les 2 tokens les plus longs (« salaire minimum »)
      if (internal.total === 0 && tokens.length >= 2) {
        const combo = `${tokens[0]} ${tokens[1]}`;
        if (combo !== primary) {
          internal = await buildInternalDocs(combo, { page: 1, page_size: 5 });
        }
      }
    }

    return {
      type: 'documents',
      lang: code,
      faq: null,
      documents: internal.results,
      documentsCount: internal.total,
      has_pertinence: internal.total > 0,
    };
  } catch (err) {
    console.error('matchFaqOrDocuments error:', err);
    return empty;
  }
};

/**
 * Enregistre le terme de recherche pour un usager connecté (historique
 * synchronisé entre appareils). Fire-and-forget : n'affecte jamais le temps
 * de réponse.
 */
const logSearchTerm = async (userId: number, terme: string) => {
  if (!userId || !terme) return;
  try {
    await strapi.documents('api::historique-recherche.historique-recherche').create({
      data: { user: userId, terme_recherche: String(terme).slice(0, 255) },
    });
  } catch (err) {
    console.error('logSearchTerm error:', (err as Error).message);
  }
};

// ─── POST /api/search ───────────────────────────────────────────────────────

export const webSearch = async (ctx: any) => {
  try {
    const { query, page, page_size, type, domaine, status } = ctx.request.body || {};
    if (!query) {
      return ctx.badRequest('Search query is required.');
    }

    // Historique serveur pour un usager connecté (les critères filtrés ne sont pas loggés)
    const user = getRequestUser(ctx);
    if (user && typeof query === 'string' && query.trim()) {
      logSearchTerm(user.id, query.trim());
    }

    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleCx = process.env.GOOGLE_CX;
    const googleEnabled = Boolean(googleApiKey && googleCx);

    // 1. Résultats internes (toujours, même si web en fallback)
    const internal = await buildInternalDocs(query, { page, page_size, type, domaine, status });

    // 2. Quota journalier Google PSE (table analytique hors Strapi — D7,
    //    accès SQL direct autorisé par la décision validée)
    const today = new Date().toISOString().split('T')[0];
    let currentCount = 0;
    try {
      await strapi.db.connection.raw(
        'INSERT INTO api_quota_usage (date, count) VALUES (?, 0) ON CONFLICT (date) DO NOTHING',
        [today]
      );
      const row = await strapi.db.connection.raw('SELECT count FROM api_quota_usage WHERE date = ?', [today]);
      currentCount = parseInt(row?.rows?.[0]?.count, 10) || 0;
    } catch (quotaErr) {
      console.error('api_quota_usage error:', (quotaErr as Error).message);
    }

    const fallback = {
      webSearchAvailable: false,
      query: encodeURIComponent(query),
      internalDocs: internal.results,
      internalDocsCount: internal.total,
      internalDocsPage: internal.page,
      internalDocsHasMore: internal.has_more,
    };

    if (currentCount >= 100 || !googleEnabled) {
      ctx.body = fallback;
      return;
    }

    // 3. Appel Google PSE (timeout 8s, comme le legacy)
    const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${encodeURIComponent(query)}`;
    let data: any = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(googleUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) data = await response.json();
      else console.error(`Google API Error: ${response.status} ${response.statusText}`);
    } catch (fetchErr) {
      console.error('Google PSE fetch error:', (fetchErr as Error).message);
    }

    if (!data) {
      ctx.body = fallback;
      return;
    }

    // 4. Incrémenter le quota uniquement en cas de succès
    try {
      await strapi.db.connection.raw('UPDATE api_quota_usage SET count = count + 1 WHERE date = ?', [today]);
    } catch (quotaErr) {
      console.error('api_quota_usage increment error:', (quotaErr as Error).message);
    }

    ctx.body = {
      ...fallback,
      webSearchAvailable: true,
      webItems: data.items || [],
    };
  } catch (err) {
    console.error('webSearch error:', err);
    ctx.body = {
      webSearchAvailable: false,
      query: encodeURIComponent(ctx.request?.body?.query || ''),
      internalDocs: [],
      internalDocsCount: 0,
      internalDocsPage: 1,
      internalDocsHasMore: false,
    };
  }
};

// ─── GET /api/search/history ────────────────────────────────────────────────
// 10 dernières recherches distinctes de l'usager connecté.

export const getSearchHistory = async (ctx: any) => {
  const user = getRequestUser(ctx);
  if (!user) {
    return ctx.unauthorized();
  }
  try {
    const rows = await strapi.documents('api::historique-recherche.historique-recherche').findMany({
      filters: { user: { id: user.id } },
      sort: [{ createdAt: 'desc' }],
      limit: 200, // fenêtre raisonnable pour dédupliquer en mémoire
    });

    // Dernière occurrence par terme (comparaison insensible à la casse)
    const seen = new Map<string, any>();
    for (const r of rows as any[]) {
      const key = String(r.terme_recherche || '').toLowerCase();
      if (!seen.has(key)) seen.set(key, r);
    }

    const results = Array.from(seen.values())
      .sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 10)
      .map((r: any) => ({ terme: r.terme_recherche, derniere_recherche: r.createdAt }));

    ctx.body = { count: results.length, results };
  } catch (err) {
    console.error('getSearchHistory error:', err);
    return ctx.internalServerError('Erreur serveur. Veuillez réessayer.');
  }
};

// Strapi charge l'export `default` du contrôleur (`importDefault`) : un fichier
// uniquement composé d'exports nommés n'est PAS enregistré et les routes
// échouent au boot (« Cannot read properties of undefined »).
export default {
  buildInternalDocs,
  matchFaqOrDocuments,
  webSearch,
  getSearchHistory,
};
