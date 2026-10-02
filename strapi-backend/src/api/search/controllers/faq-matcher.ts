/**
 * Correspondance floue question utilisateur ↔ FAQ (chatbot F9).
 *
 * Le matching historique utilisait `$containsi: question` : il ne trouvait une
 * FAQ que si l'usager tapait la question enregistrée MOT POUR MOT. En pratique,
 * la quasi-totalité des questions réelles tombait donc dans le repli
 * documentaire, souvent sans résultat.
 *
 * Approche ici (toujours sans LLM, décision F9) :
 *  1. normalisation (minuscules, sans accents, sans ponctuation) ;
 *  2. découpage en tokens, stopwords fr/en/mg retirés ;
 *  3. score = fraction des tokens de l'usager présents dans question+réponse
 *     (pondération 3× pour les tokens de la question FAQ) ;
 *  4. seuil + écart minimal avec le 2e candidat pour ne répondre que quand la
 *     correspondance est vraiment nette.
 */

/** Mots sans valeur discriminante pour le matching (fr, en, mg). */
const STOPWORDS = new Set([
  // français
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'au', 'aux', 'et', 'ou',
  'est', 'sont', 'etre', 'a', 'ai', 'ont', 'avoir', 'que', 'qui', 'quoi',
  'quel', 'quelle', 'quels', 'quelles', 'comment', 'pourquoi', 'ou', 'je', 'tu',
  'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'moi', 'te', 'se', 'sa',
  'son', 'ses', 'ma', 'mon', 'mes', 'ce', 'cet', 'cette', 'ces', 'pour', 'avec', 'sans',
  'sur', 'dans', 'en', 'par', 'plus', 'moins', 'puis', 'donc', 'si', 'ne', 'pas', 'y',
  'fait', 'faire', 'peux', 'pouvoir', 'peut', 'etes', 'suis',
  // anglais
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'is', 'are', 'was', 'were', 'be',
  'do', 'does', 'did', 'how', 'what', 'when', 'where', 'which', 'who', 'why', 'i',
  'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our',
  'their', 'this', 'that', 'these', 'those', 'can', 'could', 'should', 'would', 'will',
  'and', 'or', 'not', 'for', 'with', 'from', 'by', 'as', 'if', 'then', 'than', 'so',
  // malgache
  'ny', 'ao', 'amin', 'na', 'sy', 'dia', 'ho', 'aho', 'ianao', 'izy', 'izahay',
  'ianareo', 'izareo', 'ako', 'ko', 'io', 'ity', 'aza', 've', 'moa', 'angaha',
  'firy', 'iza', 'iny', 'ireo', 'reto', 'ireto',
]);

/** Longueur minimale d'un token pour participer au score. */
const MIN_TOKEN_LEN = 3;
/** Score minimal (fraction des tokens usager retrouvés) pour retenir une FAQ. */
const MIN_SCORE = 0.45;
/** Écart minimal avec le 2e candidat (évite les réponses au hasard). */
const MIN_GAP = 0.15;
/** Longueur maximale d'une question soumise au chatbot. */
export const MAX_QUESTION_LEN = 500;

/** minuscules + suppression des diacritiques + ponctuation → espaces. */
export const normalizeText = (input: string): string =>
  String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Tokens normalisés, stopwords et trop courts retirés. */
export const tokenize = (input: string): string[] => {
  const tokens = normalizeText(input).split(' ').filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    if (tok.length < MIN_TOKEN_LEN) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
};

/**
 * Retrouve la FAQ la mieux alignée avec la question, dans la langue donnée.
 *
 * @param rows      FAQ déjà filtrées sur la locale (question, reponse, …)
 * @param userQuery Question brute de l'usager
 * @returns La meilleure FAQ au-dessus du seuil, ou null.
 */
export const bestFaqMatch = <T extends { question?: string | null; reponse?: string | null }>(
  rows: T[],
  userQuery: string
): { faq: T; score: number; gap: number } | null => {
  const userTokens = tokenize(userQuery);
  if (userTokens.length === 0 || rows.length === 0) return null;

  // Un token usager déjà présent dans la question d'une FAQ pèse 3× plus
  // qu'un token trouvé dans la réponse : les questions se ressemblent plus
  // que les réponses.
  let best: { faq: T; score: number } | null = null;
  let second = 0;

  for (const row of rows) {
    const qTokens = new Set(tokenize(String(row.question || '')));
    const rTokens = new Set(tokenize(String(row.reponse || '')));
    if (qTokens.size === 0 && rTokens.size === 0) continue;

    let hits = 0;
    let weight = 0;
    for (const tok of userTokens) {
      if (qTokens.has(tok)) {
        hits += 1;
        weight += 3;
      } else if (rTokens.has(tok)) {
        hits += 1;
        weight += 1;
      }
    }
    const score = hits === 0 ? 0 : (weight / userTokens.length) / 3; // max 1.0

    if (!best || score > best.score) {
      if (best) second = Math.max(second, best.score);
      best = { faq: row, score };
    } else if (score > second) {
      second = score;
    }
  }

  if (!best || best.score < MIN_SCORE) return null;
  if (second > 0 && best.score - second < MIN_GAP) return null;
  return { faq: best.faq, score: best.score, gap: best.score - second };
};

/** Reconstruit la requête la plus discriminante pour la recherche documentaire. */
export const pickSearchTerms = (query: string): { primary: string; tokens: string[] } => {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    // Repli : la chaîne normalisée entière (cas « 03 » ou « r59 » par ex.)
    return { primary: normalizeText(query), tokens: [] };
  }
  // Le mot le plus long est en général le plus spécifique (ex. « cartographie »).
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  return { primary: sorted[0], tokens };
};
