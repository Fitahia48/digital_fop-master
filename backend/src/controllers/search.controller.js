const pool = require('../config/db');
const google = require('../config/google');

// Statuts juridiques acceptés par le filtre (valeurs normalisées de la migration 002)
const STATUS_MAP = {
  en_vigueur: 'en_vigueur',
  'en vigueur': 'en_vigueur',
  vigueur: 'en_vigueur',
  abroge: 'abrogé',
  'abrogé': 'abrogé',
  modifie: 'modifié',
  'modifié': 'modifié',
};

/**
 * Recherche interne (documents MTeFOP).
 * - pagination LIMIT/OFFSET
 * - tri par pertinence : correspondance exacte sur numero, puis préfixe numero,
 *   puis objet, puis type, enfin les autres ; à pertinence égale, date DESC
 * - retourne type, domaine_id et domaine_nom pour le filtrage côté front
 *
 * @returns {{ results: Array, total: number, page: number, page_size: number, has_more: boolean }}
 */
const buildInternalDocs = async (query, pool, opts = {}) => {
  const empty = { results: [], total: 0, page: 1, page_size: 20, has_more: false };
  try {
    const { type, domaine, status } = opts;
    const page = Math.max(parseInt(opts.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(opts.page_size) || 20, 1), 50);

    const like = `%${query}%`;
    const prefix = `${query}%`;

    // Conditions et paramètres de la clause WHERE (numérotés à partir de $1).
    // IMPORTANT : la requête COUNT ne réutilise QUE ces paramètres ; les
    // placeholders de tri (query/prefix) sont donc numérotés séparément plus bas.
    // (Auparavant les 3 premiers paramètres étaient passés à COUNT, qui n'en
    // attendait qu'un : la recherche interne échouait systématiquement.)
    const conditions = ['(d.objet ILIKE $1 OR d.numero ILIKE $1 OR d.type ILIKE $1)'];
    const whereParams = [like];
    let idx = 2;

    if (type) {
      conditions.push(`LOWER(d.type) LIKE LOWER($${idx++})`);
      whereParams.push(`%${type}%`);
    }
    if (domaine) {
      conditions.push(`d.domaine_id = $${idx++}`);
      whereParams.push(domaine);
    }
    if (status) {
      const normalizedStatus = STATUS_MAP[status.toString().toLowerCase().trim()];
      if (normalizedStatus) {
        conditions.push(`d.status = $${idx++}`);
        whereParams.push(normalizedStatus);
      }
    }

    const where = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM documents d WHERE ${where}`,
      whereParams
    );
    const total = parseInt(countResult.rows[0].count) || 0;

    // Placeholders du tri de pertinence et de pagination, attribués après les filtres
    const queryIdx = idx++;
    const prefixIdx = idx++;
    const limitIdx = idx++;
    const offsetIdx = idx++;

    const offset = (page - 1) * pageSize;
    const result = await pool.query(
      `SELECT d.*, dom.nom AS domaine_nom
       FROM documents d
       LEFT JOIN domaines dom ON d.domaine_id = dom.id
       WHERE ${where}
       ORDER BY
         CASE
           WHEN LOWER(d.numero) = LOWER($${queryIdx}) THEN 0
           WHEN d.numero ILIKE $${prefixIdx} THEN 1
           WHEN LOWER(d.objet) = LOWER($${queryIdx}) THEN 2
           WHEN LOWER(d.type) = LOWER($${queryIdx}) THEN 3
           ELSE 4
         END,
         d.date DESC NULLS LAST,
         d.id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...whereParams, query, prefix, pageSize, offset]
    );

    return {
      results: result.rows,
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
 * 1. Cherche une correspondance FAQ dans la langue courante (colonnes question_/reponse_<lang>).
 * 2. Sinon, élargit aux 3 langues FAQ (mieux vaut une réponse que rien).
 * 3. Sinon, retombe sur la recherche documentaire existante (buildInternalDocs).
 *
 * Aucun LLM externe : uniquement ILIKE + recherche plein-texte existante (sans coût d'API).
 *
 * @param {string} query - Question en langage naturel
 * @param {string} lang  - Langue active (fr/en/mg)
 * @returns {Promise<{type:'faq'|'documents', lang:string, faq:object|null,
 *   documents:Array, documentsCount:number, has_pertinence:boolean}>}
 */
const matchFaqOrDocuments = async (query, lang) => {
  const LANGUES = ['fr', 'en', 'mg'];
  const raw = String(query || '').trim();

  let code = String(lang || '').slice(0, 2).toLowerCase();
  if (!LANGUES.includes(code)) code = 'fr';

  const empty = {
    type: 'documents',
    lang: code,
    faq: null,
    documents: [],
    documentsCount: 0,
    has_pertinence: false,
  };
  if (!raw) return empty;

  try {
    const like = `%${raw}%`;

    // 1. Correspondance FAQ dans la langue courante
    let faqRows = await pool.query(
      `SELECT * FROM faq
       WHERE question_${code} ILIKE $1 OR reponse_${code} ILIKE $1
       ORDER BY ordre ASC, id ASC
       LIMIT 1`,
      [like]
    );

    // 2. Repli multi-langue
    if (faqRows.rows.length === 0) {
      faqRows = await pool.query(
        `SELECT * FROM faq
         WHERE question_fr ILIKE $1 OR question_en ILIKE $1 OR question_mg ILIKE $1
            OR reponse_fr ILIKE $1 OR reponse_en ILIKE $1 OR reponse_mg ILIKE $1
         ORDER BY ordre ASC, id ASC
         LIMIT 1`,
        [like]
      );
    }

    if (faqRows.rows.length > 0) {
      const row = faqRows.rows[0];
      return {
        type: 'faq',
        lang: code,
        faq: {
          id: row.id,
          question: row[`question_${code}`] || row.question_fr,
          reponse: row[`reponse_${code}`] || row.reponse_fr,
          categorie: row.categorie,
        },
        documents: [],
        documentsCount: 0,
        has_pertinence: true,
      };
    }

    // 3. Repli : recherche documentaire existante
    let internal = await buildInternalDocs(raw, pool, { page: 1, page_size: 5 });

    // Question longue en langage naturel : retenter avec le mot le plus long
    if (internal.total === 0) {
      const tokens = raw.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
      if (tokens.length > 0) {
        tokens.sort((a, b) => b.length - a.length);
        internal = await buildInternalDocs(tokens[0], pool, { page: 1, page_size: 5 });
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
 * Enregistre le terme de recherche pour un usager connecté (historique synchronisé
 * entre appareils). Fire-and-forget : n'affecte jamais le temps de réponse.
 */
const logSearchTerm = async (userId, terme) => {
  if (!userId || !terme) return;
  try {
    await pool.query(
      'INSERT INTO historique_recherche (user_id, terme_recherche) VALUES ($1, $2)',
      [userId, String(terme).slice(0, 255)]
    );
  } catch (err) {
    console.error('logSearchTerm error:', err.message);
  }
};

// GET /api/search/history/ — 10 dernières recherches distinctes de l'usager connecté
const getSearchHistory = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (LOWER(terme_recherche))
              terme_recherche,
              MAX(created_at) AS derniere_recherche
       FROM historique_recherche
       WHERE user_id = $1
       GROUP BY LOWER(terme_recherche), terme_recherche
       ORDER BY LOWER(terme_recherche), derniere_recherche DESC
       LIMIT 10`,
      [req.user.id]
    );
    // Re-trie du plus récent au plus ancien après le DISTINCT ON (qui trie par terme)
    const results = r.rows
      .sort((a, b) => new Date(b.derniere_recherche) - new Date(a.derniere_recherche))
      .map((row) => ({ terme: row.terme_recherche, derniere_recherche: row.derniere_recherche }));
    return res.json({ count: results.length, results });
  } catch (err) {
    console.error('getSearchHistory error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// POST /api/search
const webSearch = async (req, res) => {
  try {
    const { query, page, page_size, type, domaine, status } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    // Historique serveur pour un usager connecté (les critères filtrés ne sont pas loggés)
    if (req.user && typeof query === 'string' && query.trim()) {
      logSearchTerm(req.user.id, query.trim());
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Réinitialiser le compteur si nouvelle journée
    const existing = await pool.query(
      'SELECT count FROM api_quota_usage WHERE date = $1',
      [today]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO api_quota_usage (date, count) VALUES ($1, 0)',
        [today]
      );
    }

    // 2. Récupérer les résultats internes (toujours, même si web en fallback)
    const internal = await buildInternalDocs(query, pool, { page, page_size, type, domaine, status });
    const internalDocs = internal.results;

    // 3. Vérifier quota + appeler PSE ou fallback
    const row = await pool.query('SELECT count FROM api_quota_usage WHERE date = $1', [today]);
    const currentCount = row.rows[0]?.count || 0;

    if (currentCount >= 100 || !google.enabled) {
      return res.json({
        webSearchAvailable: false,
        query: encodeURIComponent(query),
        internalDocs,
        internalDocsCount: internal.total,
        internalDocsPage: internal.page,
        internalDocsHasMore: internal.has_more,
      });
    }

    // 4. Appel Google PSE
    const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${google.apiKey}&cx=${google.cx}&q=${encodeURIComponent(query)}`;

    let response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      response = await fetch(googleUrl, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (fetchErr) {
      console.error('Google PSE fetch error:', fetchErr.message);
      return res.json({
        webSearchAvailable: false,
        query: encodeURIComponent(query),
        internalDocs,
        internalDocsCount: internal.total,
        internalDocsPage: internal.page,
        internalDocsHasMore: internal.has_more,
      });
    }

    // 429 Too Many Requests ou autres erreurs HTTP → fallback
    if (!response.ok) {
      console.error(`Google API Error: ${response.status} ${response.statusText}`);
      return res.json({
        webSearchAvailable: false,
        query: encodeURIComponent(query),
        internalDocs,
        internalDocsCount: internal.total,
        internalDocsPage: internal.page,
        internalDocsHasMore: internal.has_more,
      });
    }

    const data = await response.json();

    // 5. Incrémenter le quota uniquement en cas de succès
    await pool.query(
      'UPDATE api_quota_usage SET count = count + 1 WHERE date = $1',
      [today]
    );

    const webItems = data.items || [];

    return res.json({
      webSearchAvailable: true,
      query: encodeURIComponent(query),
      internalDocs,
      internalDocsCount: internal.total,
      internalDocsPage: internal.page,
      internalDocsHasMore: internal.has_more,
      webItems,
    });

  } catch (err) {
    console.error('webSearch error:', err);
    return res.json({
      webSearchAvailable: false,
      query: encodeURIComponent(req.body.query || ''),
      internalDocs: [],
      internalDocsCount: 0,
      internalDocsPage: 1,
      internalDocsHasMore: false,
    });
  }
};

module.exports = {
  webSearch,
  getSearchHistory,
  buildInternalDocs,
  matchFaqOrDocuments,
};
