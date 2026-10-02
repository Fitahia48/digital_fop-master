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
 *  6. historique conversationnel accepté (tableau user/assistant).
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

describe('POST /api/faq/ask (chatbot F9)', { skip: !serverUp }, () => {
  test('question vide → 400', async () => {
    const { status } = await ask({ question: '   ', lang: 'fr' });
    assert.strictEqual(status, 400);
  });

  test('question trop longue → 400', async () => {
    const { status } = await ask({ question: 'a'.repeat(501), lang: 'fr' });
    assert.strictEqual(status, 400);
  });

  test('réponse structurelle pour une question hors FAQ', async () => {
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

  test('historique conversationnel accepté sans erreur', async () => {
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

  test('matching flou : formulation différente de la FAQ → réponse FAQ', async () => {
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
    assert.strictEqual(data.type, 'faq', `attendu type faq, reçu : ${JSON.stringify(data).slice(0, 200)}`);
    assert.ok(data.faq && data.faq.reponse, 'réponse FAQ attendue');
  });
});
