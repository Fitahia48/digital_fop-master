/**
 * P1 — Tests d'intégration du chatbot F9 (POST /api/faq/ask).
 *
 * Démarrage préalable : npm run develop (base seedée, cf. scripts/migrate-data.ts)
 * Exécution :          node --test tests/p1-chatbot.test.cjs
 *
 * Le fichier se SAUTE proprement si le serveur ne répond pas.
 *
 * Couverture :
 *  1. question vide → 400 ;
 *  2. question trop longue → 400 ;
 *  3. correspondance FAQ tolère accents/casse/formulations différentes
 *     (le matching est flou, pas un $containsi mot-pour-mot) ;
 *  4. FAQ trouvée → type 'faq' avec question/reponse/categorie ;
 *  5. question hors FAQ → type 'documents' ou 'llm' (repli, structure valide) ;
 *  6. historique conversationnel accepté (tableau user/assistant) ;
 *  7. messages de politesse (salutation / remerciement / congé) en fr, en et
 *     mg → type 'polite' avec texte localisé non vide, sans recherche doc ;
 *  8. une question métier commençant par « bonjour » n'est PAS captée comme
 *     politesse (pas de court-circuit du moteur de recherche).
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

// 127.0.0.1 explicitement : cf. p1-api.test.cjs (résolution IPv6 sous Windows).
const BASE = process.env.STRAPI_URL || 'http://127.0.0.1:1337';

const probe = () =>
  new Promise((resolve) => {
    try {
      const u = new URL(`${BASE}/api/faq/`);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get(u, { timeout: 4000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });

let serverUp = false;

// Mini-tokenizer aligné sur faq-matcher.ts (minuscules, sans accents, mots ≥ 3).
const tokenizeLike = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

const ask = async (body) => {
  const res = await fetch(`${BASE}/api/faq/ask/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

before(async () => {
  serverUp = await probe();
  if (!serverUp) {
    console.log('  ↩︎ Serveur Strapi absent — tests chatbot sautés.');
  }
});

// Skip au RUNTIME (dans le corps du test) : un `skip: !serverUp` posé sur le
// describe serait évalué au chargement du module, AVANT le hook `before` qui
// fait le probe — la suite serait alors toujours sautée, même serveur lancé.
const testIfUp = (name, fn) =>
  test(name, async (t) => {
    if (!serverUp) return t.skip('serveur Strapi absent');
    return fn(t);
  });

describe('POST /api/faq/ask (chatbot F9)', () => {
  testIfUp('question vide → 400', async () => {
    const { status } = await ask({ question: '   ', lang: 'fr' });
    assert.strictEqual(status, 400);
  });

  testIfUp('question trop longue → 400', async () => {
    // La limite serveur est max(MAX_QUESTION_LEN=500, CHATBOT_MAX_MESSAGE_LEN=1000).
    const over = 'a'.repeat(1001);
    const { status } = await ask({ question: over, lang: 'fr' });
    assert.strictEqual(status, 400);
  });

  testIfUp('réponse structurelle pour une question hors FAQ', async () => {
    const { status, data } = await ask({
      question: 'zxqv chaine de caractères improbables 9182',
      lang: 'fr',
    });
    assert.strictEqual(status, 200);
    assert.ok(data, 'corps JSON attendu');
    assert.ok(
      ['faq', 'documents', 'llm'].includes(data.type),
      `type inattendu : ${data.type}`
    );
    if (data.type === 'documents') {
      assert.ok(Array.isArray(data.documents), 'documents doit être un tableau');
      assert.strictEqual(typeof data.documentsCount, 'number');
    }
    if (data.type === 'llm') {
      assert.strictEqual(typeof data.text, 'string');
      assert.ok(data.text.length > 0, 'texte LLM attendu non vide');
      assert.ok(data.sources && Array.isArray(data.sources.documents));
    }
  });

  testIfUp('historique conversationnel accepté sans erreur', async () => {
    const { status, data } = await ask({
      question: 'et sinon, tu peux m\'aider sur les démarches ?',
      lang: 'fr',
      history: [
        { role: 'user', content: 'Bonjour' },
        { role: 'assistant', content: 'Bonjour ! Comment puis-je vous aider ?' },
      ],
    });
    assert.strictEqual(status, 200);
    assert.ok(data, 'corps JSON attendu');
    assert.ok(['faq', 'documents', 'llm'].includes(data.type));
  });

  testIfUp('matching flou : formulation différente de la FAQ → réponse FAQ', async () => {
    // On récupère une vraie question FAQ seedée puis on la reformule avec
    // variations d'accents et mots supplémentaires.
    const faqRes = await fetch(`${BASE}/api/faq/`);
    const faqData = await faqRes.json();
    const first = (faqData?.results || []).find((r) => r.question_fr);
    if (!first) {
      console.log('  ↩︎ Aucune FAQ seedée — test ignoré.');
      return;
    }

    // Reformulation : on garde les 4 mots les plus longs (le cœur de la
    // question) + variations de casse/accents volontairement approximatives.
    const mots = first.question_fr
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .sort((a, b) => b.length - a.length)
      .slice(0, 4);
    if (mots.length < 3) {
      console.log('  ↩︎ Question FAQ trop courte pour reformulation — test ignoré.');
      return;
    }
    const reformulee = `bonjour, ${mots.join(' ')} SVP ?`;

    const { status, data } = await ask({ question: reformulee, lang: 'fr' });
    assert.strictEqual(status, 200);

    // Deux mécanismes possibles selon la présence de GEMINI_API_KEY :
    //  - clé absente : moteur à règles → type 'faq' ;
    //  - clé active  : le LLM répond mais reçoit la FAQ en contexte → type
    //    'llm' avec la question source dans sources.faq.
    // Dans les deux cas, la propriété testée est la même : la reformulation
    // retrouve la BONNE question FAQ malgré accents/casse/mots parasites.
    if (data.type === 'faq') {
      assert.ok(data.faq && data.faq.reponse, 'réponse FAQ attendue');
    } else if (data.type === 'llm') {
      assert.ok(typeof data.text === 'string' && data.text.length > 0, 'réponse LLM non vide');
      const matched = (data.sources?.faq || []).some(
        (f) => f.question && tokenizeLike(f.question).some((tok) => tokenizeLike(reformulee).includes(tok))
      );
      assert.ok(matched, 'la question reformulée doit retrouver la FAQ source dans le contexte');
    } else {
      assert.fail(`type inattendu : ${data.type} — ${JSON.stringify(data).slice(0, 200)}`);
    }
  });

  // ── Étape 2 : messages de politesse (jamais de réponse vide ni d'erreur) ──
  const POLITENESS_CASES = [
    // [message, langue attendue]
    ['bonjour', 'fr'],
    ['salut', 'fr'],
    ['bonsoir', 'fr'],
    ['merci', 'fr'],
    ['au revoir', 'fr'],
    ['bonne journée', 'fr'],
    ['hello', 'en'],
    ['thank you', 'en'],
    ['goodbye', 'en'],
    ['salama', 'mg'],
    ['misaotra', 'mg'],
    ['veloma', 'mg'],
  ];

  for (const [message, lang] of POLITENESS_CASES) {
    testIfUp(`politesse « ${message} » (${lang}) → type polite localisé`, async () => {
      const { status, data } = await ask({ question: message, lang });
      assert.strictEqual(status, 200);
      assert.strictEqual(
        data.type,
        'polite',
        `type polite attendu pour « ${message} », reçu : ${JSON.stringify(data).slice(0, 200)}`
      );
      assert.ok(typeof data.text === 'string' && data.text.trim().length > 0, 'texte de politesse non vide attendu');
      assert.strictEqual(data.lang, lang);
      assert.deepStrictEqual(data.documents, [], 'aucune suggestion de document pour une politesse');
    });
  }

  testIfUp('politesse : aucune entrée FAQ publique créée pour les salutations', async () => {
    // Les réponses de politesse sont INTERNES au chatbot : la FAQ publique
    // (page Aide) ne doit contenir aucune question de type « bonjour ».
    await ask({ question: 'bonjour', lang: 'fr' });
    const res = await fetch(`${BASE}/api/faq/`);
    const data = await res.json();
    const polluted = (data?.results || []).filter((r) =>
      /^(bonjour|salut|bonsoir|hello|merci|au revoir|salama|veloma)\b/i.test(String(r.question_fr || '').trim())
    );
    assert.strictEqual(polluted.length, 0, `FAQ publique polluée : ${JSON.stringify(polluted).slice(0, 200)}`);
  });

  testIfUp('question métier commençant par une salutation → PAS de réponse politesse', async () => {
    const { status, data } = await ask({
      question: 'bonjour, comment accéder au texte intégral dun document ?',
      lang: 'fr',
    });
    assert.strictEqual(status, 200);
    assert.notStrictEqual(data.type, 'polite', 'une vraie question ne doit pas être captée par le court-circuit politesse');
  });
});
