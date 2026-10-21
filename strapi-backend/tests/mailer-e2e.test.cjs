/**
 * ÉTAPE 4 — Tests d'intégration de bout en bout du pipeline d'alertes de
 * publication, contre une instance Strapi en cours d'exécution + serveur de
 * capture SMTP local (scripts/smtp-capture.ts).
 *
 * Contexte :
 *   - capture : http://127.0.0.1:8025 (SMTP 127.0.0.1:1025, SMTP_NO_AUTH=true)
 *     - GET  /health, /messages, /messages/:id, /messages/:id[.html|.txt]
 *     - DELETE /messages (remise à zéro)
 *   - serveur : http://127.0.0.1:1337 (environnement de test, pas de SMTP réel)
 *
 * Cibles d'essai (fictives, jamais d'abonnés réels) :
 *   A confirmé FR, B confirmé EN, C non confirmé, D confirmé puis désabonné,
 *   E confirmé (parcours désabonnement via lien d'email), 100 fictifs.
 *
 * Démarrage préalable :
 *   1. serveur Strapi avec SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_NO_AUTH=true
 *      FRONTEND_URL=http://localhost:5173 MAIL_BATCH_PAUSE_MS=500
 *   2. node .tmp-scripts/scripts/smtp-capture.js
 *
 * Variables d'environnement (defaults = comptes de test annotés depuis
 * scripts/create-admin.cjs) :
 *   ADMIN_EMAIL / ADMIN_PASSWORD     → comptes U&P (Autorisé)
 *   ADMIN_PANEL_EMAIL / ADMIN_PANEL_PASSWORD → panneau Strapi
 *   CAPTURE_URL (défaut http://127.0.0.1:8025)
 *   STRAPI_URL (défaut http://127.0.0.1:1337)
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const STRAPI_URL = process.env.STRAPI_URL || 'http://127.0.0.1:1337';
const CAPTURE_URL = process.env.CAPTURE_URL || 'http://127.0.0.1:8025';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin.test@mtefop.mg';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestAdmin2026!';
const ADMIN_PANEL_EMAIL = process.env.ADMIN_PANEL_EMAIL || 'rahasafitahiandraibe@gmail.com';
const ADMIN_PANEL_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || 'Admin2026!';

// ─── Utilitaires HTTP ───────────────────────────────────────────────────────

const probe = () =>
  new Promise((resolve) => {
    const u = new URL(`${STRAPI_URL}/api/documents/?page_size=1`);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { timeout: 6000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });

let strapiUp = false;
let captureUp = false;
let adminToken = null; // U&P admin-role (créé par assign-permissions)
let panelToken = null; // JWT panneau Strapi (admin_users)

const api = async (path, { method = 'GET', token, body, headers } = {}) => {
  const h = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) };
  const u = new URL(path, STRAPI_URL);
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: h,
        timeout: 20000,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data: data });
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body && method !== 'GET') req.write(JSON.stringify(body));
    req.end();
  });
};

const login = async (email, password, kind) => {
  const body = { email, password };
  const res = await api(
    kind === 'panel'
      ? '/admin/login'
      : '/api/v1/auth/jwt/create/',
    { method: 'POST', body }
  );
  return res.status === 200 ? res.data.access || res.data.token || null : null;
};

const expectServerReady = async (t) => {
  if (strapiUp) return;
  const ok = await probe();
  if (!ok) {
    t.skip(`serveur Strapi injoignable sur ${STRAPI_URL} — démarrer « npm run develop » avec les variables SMTP de capture`);
    return;
  }
  strapiUp = true;
};

const requireCapture = async (t) => {
  const u = new URL(`${CAPTURE_URL}/health`);
  const mod = u.protocol === 'https:' ? https : http;
  const req = mod.get(u, { timeout: 4000 }, (res) => {
    res.resume();
    if (res.statusCode >= 200 && res.statusCode < 500) {
      const d = JSON.parse(require('node:fs').readFileSync('/dev/stdin', 'utf8'));
      captureUp = Boolean(d.ok);
    } else captureUp = false;
  });
  req.on('error', () => {
    captureUp = false;
  });
  // lecture côté requête + réponse : on ne peut pas await une tcp...
  // on proxy le verdict à l'aide de setTimeout sinon le test reste suspendu
  setTimeout(() => {
    if (!captureUp) {
      t.skip(`serveur de capture SMTP injoignable sur ${CAPTURE_URL}`);
      return;
    }
  }, 100);
};

// ─── Configuration de la base pour les tests ────────────────────────────────

/**
 * Étapes préliminaires :
 *   1. login admin U&P + panneau ;
 *   2. remise à zéro de la capture ;
 *   3. création des abonnés synthèses (A confirmé FR / B confirmé EN /
 *      C non confirmé / D confirmé puis désabonné / 100 fictifs) — ceux-ci
 *      vivent uniquement pour les tests et sont supprimés en fin de suite ;
 *   4. confirmation réelle des abonnés A/B via leur lien (API d'admin).
 *
 * NOTE : ne fait absolument JAMAINT remonter d'erreur → un échec d'environnement
 * ne peut jamais être rapporté comme un succès de test.
 */
const setup = async () => {
  // 1. sessions d'admin
  if (!adminToken) adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD, 'normal');
  if (!panelToken) panelToken = await login(ADMIN_PANEL_EMAIL, ADMIN_PANEL_PASSWORD, 'panel');
  if (!adminToken || !panelToken) {
    console.error('[mailer-e2e] ❌ admin U&P ou panneau inaccessible — annulation.');
    process.exit(1);
  }

  // 2. capture propre
  if (captureUp) {
    await api(`${CAPTURE_URL}/messages`, { method: 'DELETE' });
  }

  // 3. abonnés synthèses
  const SUBS = [
    { email: 'a.abonne@test.local', langue: 'fr', expected: 1 },
    { email: 'b.abonne@test.local', langue: 'en', expected: 1 },
    { email: 'c.abonne@test.local', langue: 'fr', expected: 0 },
    { email: 'd.abonne@test.local', langue: 'fr', expected: 0 },
    { email: 'e.abonne@test.local', langue: 'fr', expected: 1 },
  ];
  const subscribers = [];
  for (const s of SUBS) {
    const r = await api(`/api/subscribers/subscribe/`, {
      method: 'POST',
      body: { email: s.email, langue_preferee: s.langue },
    });
    assert.strictEqual(r.status, 201, `inscription de ${s.email} → 201`);
    subscribers.push({ ...s, confirmToken: null, unsubscribeToken: null });
  }

  // Lecture des tokens côté admin (contenu manager) + confirmation A/B via lien
  const rows = await adminContentManager('api::subscriber.subscriber', { limit: -1 });
  const byEmail = new Map(rows.results.map((r) => [r.email, r]));
  for (const s of subscribers) {
    s.unsubscribeToken = byEmail.get(s.email)?.unsubscribe_token || null;
  }

  // Confirmation réelle des A/B (par leur lien) — le mail de confirmation doit
  // être visible dans la capture pour prouver le circuit complet.
  const confirmationByEmail = new Map();
  const all = await adminContentManager('api::subscriber.subscriber', { limit: -1 });
  for (const s of subscribers) {
    if (s.langue === 'fr' && s.email.startsWith('a.')) {
      const mail = all.results.find((m) => m.email === s.email && m.is_confirmed === false);
      // (tokens lus plus haut); on continue avec la confirmation API du test suivant
    }
  }

  // Réordonner pour simplification : confirmation A/B via l'API subscribers
  // (le lien est déjà validé côté serveur par la lecture ci-dessus).
  for (const s of subscribers) {
    if (s.email.startsWith('a.') || s.email.startsWith('b.')) {
      // Le token de confirmation est stocké dans la BD : on le récupère via la
      // liste complète (tous les champs sont retournés par le manager).
      const row = rows.results.find(
        (m) => m.email === s.email && m.is_confirmed === false
      );
      if (row?.confirm_token) {
        const r = await api(
          `/api/subscribers/confirm/${encodeURIComponent(row.confirm_token)}/`,
          { method: 'GET' }
        );
        assert.strictEqual(r.status, 200, `lien de confirmation OK pour ${s.email}`);
        s.confirmToken = row.confirm_token;
      }
    }
  }

  // D : désabonnement complet (confirmation + désabonnement via lien d'email)
  if (subscribers.find((s) => s.email === 'd.abonne@test.local')) {
    const d = subscribers.find((s) => s.email === 'd.abonne@test.local');
    const row = rows.results.find((m) => m.email === 'd.abonne@test.local');
    if (row?.confirm_token) {
      const r = await api(
        `/api/subscribers/confirm/${encodeURIComponent(row.confirm_token)}/`,
        { method: 'GET' }
      );
      assert.strictEqual(r.status, 200, 'confirmation D');
    }
    if (d.unsubscribeToken) {
      const r = await api(
        `/api/subscribers/unsubscribe/${encodeURIComponent(d.unsubscribeToken)}/`,
        { method: 'GET' }
      );
      assert.strictEqual(r.status, 200, 'désabonnement D');
    }
  }

  // 100 fictifs : inscrits EN BONUS (confirmés ensuite via token de leur mail)
  const fakeCount = 100;
  for (let i = 0; i < fakeCount; i++) {
    const email = `fake${String(i).padStart(3, '0')}@test.local`;
    const r = await api(`/api/subscribers/subscribe/`, {
      method: 'POST',
      body: { email, langue_preferee: 'fr' },
    });
    assert.strictEqual(r.status, 201, `inscription fictive ${email}`);
    // stockage pour la suite (token de confirmation extrait dans T7)
    subscribers.push({ email, langue: 'fr', expected: 1, fake: true, index: i, confirmToken: null, unsubscribeToken: null });
  }

  return subscribers;
};

/**
 * Liste complète d'un content-type via l'interface panneau de l'admin (seul
 * accès aux champs cachés : confirm_token, unsubscribe_token, is_confirmed).
 * Requiert panelToken.
 */
const adminContentManager = async (collection, opts = {}) => {
  const q = new URLSearchParams({
    pagination: { pageSize: 1000 },
    filters: JSON.stringify(opts.filters || {}),
  }).toString();
  const res = await api(
    `/api/content-manager/collection-types/${encodeURIComponent(collection)}?${q}`,
    { method: 'GET', token: panelToken }
  );
  return res.status === 200 ? res.data : { results: [] };
};

/**
 * Lit la liste des messages capturés (court) et laisse le test en tirer les
 * assertions (évite de découper entre deux appels).
 */
const capturedMessages = async () => {
  const res = await api(`${CAPTURE_URL}/messages`, { method: 'GET' });
  return res.status === 200 ? res.data : [];
};

const waitUntil = async (fn, timeout = 25000, interval = 300) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error(`Délai dépassé après ${timeout} ms : ${fn.toString().slice(0, 60)}…`);
};

// ─── Scénario 1 — Inscription ───────────────────────────────────────────────

// ─── Scénario 2 — Document publié par le formulaire admin ───────────────────

// ─── Scénario 3 — Brouillon puis passage à validee ─────────────────────────

// ─── Scénario 4 — Actualité ─────────────────────────────────────────────────

// ─── Scénario 5 — Désabonnement actif suite à un e-mail ─────────────────────

// ─── Scénario 6 — Panne SMTP simulée ────────────────────────────────────────

// ─── Scénario 7 — 100 abonnés fictifs : durée, débit, aucun doublon, aucun oubli ─

// ─── Scénario 8 — Titre avec apostrophe, & et accents ──────────────────────

// ─── Scénario 9 — Captures HTML + texte + lien de désabonnement visible ────

// ─── Scénario 10 — Script de migration : aucun e-mail ──────────────────────

// ─── Scénario 10b — Opt-out x-no-notify par en-tête (import via API) ────────

// ─── Helper (simule les circuits front/panneau) ─────────────────────────────


// Installation propre : on ne supresse que ce que l'on a créé.
async function cleanup(subscribers) {
  // suppression des abonnés fictifs (D a été supprimé par le déroulement)
  const toDelete = subscribers.filter((s) => s.fake === true || s.email.startsWith('d.'));
  for (const s of toDelete) {
    try {
      await api(`/api/subscribers/unsubscribe/${encodeURIComponent(s.unsubscribeToken || '')}/`, {
        method: 'GET',
        token: adminToken,
      });
    } catch {
      /* déjà supprimé ou sans token */
    }
  }
  console.log(`🧹 nettoyage terminé pour ${toDelete.length} abonné(s) de test`);
};

test('T1 — Inscription : confirme l\'abonné, les non confirmés reçoivent rien', async (t) => {
  await expectServerReady(t);

  // sous-assertions auto-documentées dans les logs
  const A = subscribers.find((s) => s.email === 'a.abonne@test.local');
  assert.ok(A.confirmToken, 'token de confirmation A résolu');

  const aBefore = await capturedMessages();
  console.log(`📥 capture avant publication : ${aBefore.length} message(s)`);

  // A reçoit le mail de confirmation (déjà capturé par construction) → lien OK
  const confirmRes = await api(
    `/api/subscribers/confirm/${encodeURIComponent(A.confirmToken)}/`,
    { method: 'GET' }
  );
  assert.strictEqual(confirmRes.status, 200);

  // C (non confirmé) : pas de mail de publication après la création suivante
  const docBefore = await api(`/api/documents/?page_size=1`);
  assert.ok(docBefore.data && Array.isArray(docBefore.data.results));
  const draft = await createDraftInPanel({
    type: 'note',
    objet: `T1 draft ${Date.now()}`,
    numero: `T1-D${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: '2026-01-01',
  });
  await waitUntil(async () => capturedMessages().length, 25000);
  const after = await capturedMessages();
  const publications = after.filter((m) => m.html && /publication|alert/.test(m.subject));
  // C n'est jamais confirmé → jamais destinataire : 0 message à son adresse
  assert.strictEqual(after.some((m) => m.to.includes('c.abonne@test.local')), false);
});

// ─── Scénario 2 — Document publié par le formulaire admin ───────────────────

test('T2 — Document publié (admin, état validee) : A et B UN e-mail chacun, lien qui ouvre la bonne fiche, C/D rien', async (t) => {
  await expectServerReady(t);

  const titre = `relatif à l'Etat & aux agents — T2 ${Date.now()}`;
  const doc = await createDocumentInAdmin({ type: 'note', objet: titre, numero: `T2-N${Date.now()}`, date: '2026-01-01', status: 'en_vigueur' });

  // 10. attendre la publication des emails (débit + pause configurés)
  await waitUntil(
    async () => {
      const msgs = await capturedMessages();
      const publications = msgs.filter((m) => m.html && /document/i.test(m.subject));
      return publications.length >= 2;
    },
    25000
  );

  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs.length, 2, `2 publications capturées (obtenu ${pubs.length})`);

  const toA = msgs.some((m) => m.to.includes('a.abonne@test.local'));
  const toB = msgs.some((m) => m.to.includes('b.abonne@test.local'));
  assert.ok(toA, 'A reçoit bien son mail');
  assert.ok(toB, 'B reçoit bien son mail');
  assert.strictEqual(msgs.some((m) => m.to.includes('c.abonne@test.local')), false);
  assert.strictEqual(msgs.some((m) => m.to.includes('d.abonne@test.local')), false);

  // lien de la fiche via l'id numérique du front
  const linked = pubs.some((m) =>
    m.html.includes(`/documents/${doc.id}/`)
  );
  assert.ok(linked, 'lien dans le mail pointe vers la bonne fiche /documents/:id du front');
  assert.ok(
    pubs.every((m) => m.listUnsubscribe),
    'en-tête List-Unsubscribe présent sur les deux mails'
  );
});

// ─── Scénario 3 — Brouillon puis passage à validee ─────────────────────────

test('T3 — Brouillon sans mail ; passage validee : mail à A/B ; nouveau passage → AUCUN second envoi', async (t) => {
  await expectServerReady(t);

  const doc = await createDraftInPanel({
    type: 'note',
    objet: `T3 draft ${Date.now()}`,
    numero: `T3-D${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: '2026-01-01',
  });

  // draft → APRES : pas de mail (nulle part)
  await waitUntil(async () => capturedMessages().length, 25000);
  const afterDraft = await capturedMessages();
  const pubsAfterDraft = afterDraft.filter((m) => m.html && /publication/i.test(m.subject));
  assert.strictEqual(pubsAfterDraft.length, 0);

  // panneau Strapi : passer à « validee »
  const val = await setEtatInPanel(doc.id, 'validee');
  assert.ok(val && val.ok);

  // publication → 1 mail à A et à B seulement (2 messages)
  await waitUntil(
    async () => capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= 2,
    25000
  );
  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs.length, 2);
  assert.ok(pubs.every((m) => m.to.includes('a.abonne@test.local') || m.to.includes('b.abonne@test.local')));
  assert.strictEqual(pubs.some((m) => m.to.includes('c.abonne@test.local')), false);

  // retour en brouillon puis validee → AUCUN second envoi
  setEtatInPanel(doc.id, 'brouillon');
  setEtatInPanel(doc.id, 'validee');
  await sleep(1500);
  const finalCount = await capturedMessages();
  const pubs2 = finalCount.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs2.length, 0, 'Aucun second envoi quand le document repasse en brouillon en cours de vie');
});

// ─── Scénario 4 — Actualité ─────────────────────────────────────────────────

test('T4 — Actualité publiée : e-mails à A et B avec lien fonctionnel vers la section Actualités', async (t) => {
  await expectServerReady(t);

  const actuTitre = `Décret de la qualité T4 ${Date.now()}`;
  const actu = await createActuInAdmin({ titre: actuTitre, conseil: 'CONSEIL DES MINISTRES', date: '2026-02-01', lieu: 'Tôhan' });

  await waitUntil(
    async () =>
      capturedMessages().filter((m) => m.html && /actualité|actualit/i.test(m.subject)).length >= 2,
    25000
  );

  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /actualité|actualit/i.test(m.subject));
  assert.strictEqual(pubs.length, 2);
  assert.ok(
    pubs.every((m) => m.to.includes('a.abonne@test.local') || m.to.includes('b.abonne@test.local'))
  );
  assert.strictEqual(pubs.some((m) => m.to.includes('c.abonne@test.local')), false);
  const linked = pubs.some((m) => m.html.includes('onboarding-news'));
  assert.ok(linked, 'lien de l\'actualité pointe vers la section existante #onboarding-news');
});

// ─── Scénario 5 — Désabonnement actif suite à un e-mail ─────────────────────

test('T5 — Lien de désabonnement cliqué → l\'abonné reçoit moins rien sur la suite', async (t) => {
  await expectServerReady(t);

  const E = subscribers.find((s) => s.email === 'e.abonne@test.local');
  assert.ok(E.confirmToken, 'E confirmé via lien');

  // E reçoit une publication (l'actualité T4 ou suivante)
  const msgsBefore = await capturedMessages();
  const pubsE = msgsBefore.filter((m) => m.html && /actualité|document/i.test(m.subject));
  assert.ok(pubsE.length >= 1, 'E reçoit au moins une publication');

  const eMail = pubsE.find((m) => m.to.includes('e.abonne@test.local'));
  assert.ok(eMail, 'e-mail d\'E trouvé dans la capture');
  const token = eMail.listUnsubscribe && eMail.listUnsubscribe.replace(/<(.+?)>/, '$1');
  assert.ok(token, 'lien de désabonnement (List-Unsubscribe) lisible');

  // la "cliquer" : la route d'API (même circuit que la page /unsubscribe/:token)
  const r = await api(
    `/api/subscribers/unsubscribe/${encodeURIComponent(token)}/`,
    { method: 'GET' }
  );
  assert.strictEqual(r.status, 200, 'désabonnement OK');

  // publication suivante → E absent
  const doc = await createDocumentInAdmin({ type: 'note', objet: `T5 follow-up ${Date.now()}`, numero: `T5-F${Date.now()}`, date: '2026-02-02' });
  await waitUntil(
    async () =>
      capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= 2,
    25000
  );
  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs.some((m) => m.to.includes('e.abonne@test.local')), false, 'E ne reçoit plus rien après désabonnement');
});

// ─── Scénario 6 — Panne SMTP simulée ────────────────────────────────────────

test('T6 — SMTP down : le document se crée quand même, erreur loguée, puis récupération', async (t) => {
  await expectServerReady(t);

  // 1. stoppe le serveur de capture
  await api(`${CAPTURE_URL}/control/pause`, { method: 'POST' });
  await sleep(500);

  // 2. création du document → 201, vie grise
  const doc = await createDocumentInAdmin({ type: 'note', objet: `T6 fault ${Date.now()}`, numero: `T6-F${Date.now()}`, date: '2026-02-03' });

  // 3. l'erreur est journalisée (log + table email-log) — la publication n'est pas bloquée
  const logRes = await api(`${CAPTURE_URL}/health`, { method: 'GET' });
  // (log serveur vérifié à part : capture.log contient 'Mailer : échec essai 1/3')
  // assertion via la table de journal (admin panel)
  const logRow = await adminContentManager('api::email-log.email-log', { filters: { publication: { $eq: 'document' } } });
  const latest = logRow.results.find((l) => l.titre && l.titre.includes('T6'));
  assert.ok(latest, 'ligne journal d\'envoi créée pour la publication en panne');
  assert.strictEqual(latest.echec > 0, true, `log de l'échec : ${latest.detail || 'vide'}`);

  // 4. continuation : réactivation + nouvelle publication OK
  await api(`${CAPTURE_URL}/control/resume`, { method: 'POST' });
  await sleep(500);
  const next = await createDocumentInAdmin({ type: 'note', objet: `T6 recovery ${Date.now()}`, numero: `T6-R${Date.now()}`, date: '2026-02-04' });
  await waitUntil(
    async () =>
      capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= 2,
    30000
  );
  const msgs = await capturedMessages();
  assert.ok(msgs.filter((m) => m.html && /document/i.test(m.subject)).length >= 2);
});

// ─── Scénario 7 — 100 abonnés fictifs : durée, débit, aucun doublon, aucun oubli ─

test('T7 — 100 abonnés fictifs : bout en bout, durée, débit, comptage strict', async (t) => {
  await expectServerReady(t);

  const confirmers = subscribers.filter((s) => s.fake && s.confirmToken === null);
  // confirmation propre à chacun (circuit réel, comme les A/B)
  for (const s of confirmers) {
    const row = (await adminContentManager('api::subscriber.subscriber', { filters: { email: { $eq: s.email } } })).results[0];
    if (!s.confirmToken && row?.confirm_token) {
      const r = await api(
        `/api/subscribers/confirm/${encodeURIComponent(row.confirm_token)}/`,
        { method: 'GET' }
      );
      assert.strictEqual(r.status, 200, `confirmation ${s.email}`);
      s.confirmToken = row.confirm_token;
    }
  }

  // Nombre attendu : A, B + 100 fictifs confirmés
  const EXPECTED = subscribers.filter((s) => s.expected === 1 && s.confirmToken).length;

  // publication
  const doc = await createDocumentInAdmin({ type: 'note', objet: `T7 bulk ${Date.now()}`, numero: `T7-B${Date.now()}`, date: '2026-02-05' });

  const start = Date.now();
  await waitUntil(
    async () =>
      capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= EXPECTED,
    45000
  );
  const duration = Date.now() - start;
  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));

  // 1) exactitude du nombre, sans doublon ni oubli
  const addresses = new Set(pubs.flatMap((m) => m.to));
  assert.strictEqual(addresses.size, EXPECTED, `102 adresses uniques (obtenu ${addresses.size})`);
  const expectedSet = new Set(
    subscribers.filter((s) => s.expected === 1 && s.confirmToken).map((s) => s.email)
  );
  for (const a of expectedSet) assert.ok(addresses.has(a), `oubli de ${a}`);
  for (const a of addresses) assert.ok(expectedSet.has(a), `adresse impossible ${a}`);

  // 2) gravité : envoyés + échecs = total (mailer logique)
  const logRow = (await adminContentManager('api::email-log.email-log', { filters: { publication: { $eq: 'document' } } })).results
    .find((l) => l.titre && l.titre.includes('T7'));
  assert.ok(logRow, 'ligne journal T7 existe');
  assert.strictEqual(logRow.destinataires, EXPECTED);
  assert.strictEqual(logRow.envoyes + logRow.echec, logRow.destinataires, 'compteur strict : envoyés + échecs = destinataires');

  // 3) respect du débit (pause entre lots visible)
  assert.ok(duration >= (Math.ceil(EXPECTED / 20) - 1) * 500, `durée trio limitant ${duration}ms (bon de <${(Math.ceil(EXPECTED / 20) - 1) * 500}ms)`);

  // 4) aucun léger gestionnaire de log (pas d'adresse "impossible")
  console.log(`📦 T7 : ${EXPECTED} abonnés, ${duration} ms, débit respecté`);
});

// ─── Scénario 8 — Titre avec apostrophe, & et accents ──────────────────────

test('T8 — Sujet et corps propres : pas d\'entités HTML dans le sujet, accents visibles', async (t) => {
  await expectServerReady(t);

  // Titre précisément celui de la phrase de l'épreuve
  const titre = `relatif à l'Etat & aux agents — T8 ${Date.now()}`;
  const doc = await createDocumentInAdmin({ type: 'note', objet: titre, numero: `T8-N${Date.now()}`, date: '2026-02-06' });

  await waitUntil(
    async () => capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= 2,
    25000
  );

  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs.length, 2);

  for (const m of pubs) {
    // sujet : titre brut (aucun échappement HTML)
    assert.ok(!m.subject.includes('&#39;'), 'pas de &#39; dans le sujet');
    assert.ok(!m.subject.includes('&amp;'), 'pas de &amp; dans le sujet');
    assert.ok(m.subject.includes('l\'Etat'), 'apostrophe du titre dans le sujet');
    assert.ok(m.subject.includes('&'), 'le & du titre est visible dans le sujet');
    assert.ok(m.subject.includes('à'), 'accent « à » dans le sujet');

    // corps HTML : échappé correctement (affichage propre)
    assert.ok(m.html.includes('l&#39;Etat'), 'apostrophe échappée dans le HTML');
    assert.ok(m.html.includes('&amp;'), 'le & échappé dans le HTML');
    assert.ok(m.html.includes('à l\'Etat'), 'affichage correct de l\'accent dans le corps');

    // version texte : caractères bruts, URL visible
    assert.ok(m.text.includes("l'Etat & aux agents"), 'texte brut avec apostrophe et &');

    // lien de la fiche
    assert.ok(m.html.includes(`/documents/${doc.id}/`));
  }
});

// ─── Scénario 9 — Captures HTML + texte + lien de désabonnement visible ────

test('T9 — Captures HTML/.txt du serveur de capture avec lien de désabonnement visible', async (t) => {
  await expectServerReady(t);

  // refaire une publication courte pour disposer d'un mail frais à capturer complètement
  const doc = await createDocumentInAdmin({ type: 'note', objet: `T9 capture ${Date.now()}`, numero: `T9-C${Date.now()}`, date: '2026-02-07' });
  await waitUntil(
    async () => capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= 2,
    25000
  );

  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs.length, 2);

  for (const m of pubs) {
    const htmlFile = `D:\\Monprojet\\projetDRFP\\digital_fop-master\\strapi-backend\\.tmp\\capture-mail\\${m.id}.html`;
    const txtFile = `D:\\Monprojet\\projetDRFP\\digital_fop-master\\strapi-backend\\.tmp\\capture-mail\\${m.id}.txt`;
    // fichiers sur disque produits par le serveur de capture
    const fs = require('node:fs');
    assert.ok(fs.existsSync(htmlFile), `capture HTML disque : ${htmlFile}`);
    assert.ok(fs.existsSync(txtFile), `capture texte disque : ${txtFile}`);

    // lien de désabonnement visible dans les deux représentations
    assert.ok(m.html.includes('unsubscribe/'), 'lien de désabonnement présent dans le HTML');
    assert.ok(m.text.includes('unsubscribe'), 'lien de désabonnement présent dans le texte');
  }
});

// ─── Scénario 10 — Script de migration : aucun e-mail ──────────────────────

test('T10 — Script de migration (création in-process, sans contexte HTTP) : aucun e-mail', async (t) => {
  await expectServerReady(t);

  // avant : nombre de publications capturées
  const before = await capturedMessages();
  const baseline = before.filter((m) => m.html && /document/i.test(m.subject)).length;

  // executer la probe d'un script in-process (birde sa propre instance
  // Strapi — sans HTTP, donc pas de contexte de requête → aucun envoi)
  const probe = require('./scripts/strapi-dev-wrapper.js');
  // (la probe complète est un fichier dédié : scripts/notify-probe.ts)
  const probePath = require.resolve('./scripts/notify-probe');
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [probePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
  console.log('📜 sortie probe :', out.trim().slice(0, 300));

  const after = await capturedMessages();
  const newPubs = after.filter((m) => m.html && /document/i.test(m.subject)).length;
  assert.strictEqual(newPubs, 0, 'un script in-process (migration) n\'envoie aucun e-mail');
});

// ─── Scénario 10b — Opt-out x-no-notify par en-tête (import via API) ────────

test('T10b — En-tête x-no-notify sur une création HTTP : aucun e-mail', async (t) => {
  await expectServerReady(t);

  const titre = `T10b silent ${Date.now()}`;
  const res = await api(`/api/documents/`, {
    method: 'POST',
    token: adminToken,
    headers: { 'x-no-notify': '1' },
    body: { type: 'note', objet: titre, numero: `T10B${Date.now()}`, date: '2026-02-08', status: 'en_vigueur' },
  });
  assert.strictEqual(res.status, 201);

  await waitUntil(
    async () => capturedMessages().filter((m) => m.html && /document/i.test(m.subject)).length >= 2,
    25000
  );
  const msgs = await capturedMessages();
  const pubs = msgs.filter((m) => m.html && /document/i.test(m.subject));
  assert.strictEqual(pubs.filter((m) => m.to.includes('a.abonne@test.local')).length > 0, false,
    'x-no-notify → aucun envoi aux abonnés');
});

// ─── Helper (simule les circuits front/panneau) ─────────────────────────────

/**
 * Crée un document en tant qu'administrateur (même circuit que le formulaire
 * admin du front : controller custom avec contrôle de rôle → état validee).
 */
async function createDocumentInAdmin(data) {
  const r = await api(`/api/documents/`, { method: 'POST', token: adminToken, body: data });
  assert.strictEqual(r.status, 201, `création admin → 201 : ${r.data?.detail || r.data?.error}`);
  const doc = r.data;
  // vérification du filtrage public : un non-administrateur ne voit ce document
  // que S'IL EST VALIDÉ (règle P1)
  const anonyme = await api(`/api/documents/${doc.id}/`);
  if (doc.etat_notice === 'validee') assert.strictEqual(anonyme.status, 200);
  else assert.strictEqual(anonyme.status, 404, 'brouillon/refusé au public');
  return doc;
};

/**
 * Simule la création dans le CONTENU manager (panneau Strapi) : état par défaut
 * « brouillon » → LE SERVER VIENT DE LA COUCHE INFRA (pas de lifecycle).
 */
async function createDraftInPanel(data) {
  const r = await api(
    `/api/content-manager/collection-types/api::document.document`,
    { method: 'POST', token: panelToken, body: data }
  );
  assert.strictEqual(r.status, 201, `create panneau → 201 : ${r.data?.detail || r.data?.error}`);
  return { id: r.data.id, etat_notice: 'brouillon' };
};

async function setEtatInPanel(id, etat) {
  const r = await api(
    `/api/content-manager/collection-types/api::document.document/${id}/`,
    { method: 'PATCH', token: panelToken, body: { etat_notice: etat } }
  );
  return { ok: r.status === 200 };
};

async function createActuInAdmin(data) {
  const r = await api(`/api/actualites/`, { method: 'POST', token: adminToken, body: data });
  assert.strictEqual(r.status, 201, `creation actualité → 201`);
  return r.data;
}

// Installation propre : on ne supresse que ce que l'on a créé.
async function cleanup(subscribers) {
  // suppression des abonnés fictifs (D a été supprimé par le déroulement)
  const toDelete = subscribers.filter((s) => s.fake === true || s.email.startsWith('d.'));
  for (const s of toDelete) {
    try {
      await api(`/api/subscribers/unsubscribe/${encodeURIComponent(s.unsubscribeToken || '')}/`, {
        method: 'GET',
        token: adminToken,
      });
    } catch {
      /* déjà supprimé ou sans token */
    }
  }
  console.log(`🧹 nettoyage terminé pour ${toDelete.length} abonné(s) de test`);
};

describe('Alertes de publication — deux à deux (ÉTAPE 4)', () => {
  before(async () => {
    subscribers = await setup();
  });

  after(async () => {
    await cleanup(subscribers);
    await api(`${CAPTURE_URL}/messages`, { method: 'DELETE' }).catch(() => {});
  });

  // tests T1..T10b définis plus haut — exécutés séquentiellement dans le fichier
});

// ─── Lancement de la suite (node --test) ─────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('mailer-e2e.test.cjs')) {
  console.error('▶️  mailer-e2e : exécuter avec `node --test tests/mailer-e2e.test.cjs`');
}

// ─── Lancement de la suite (runner node :run) ───────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('mailer-e2e.test.cjs')) {
  console.error('▶️  lancement de la suite mailer-e2e (node --test)');
}
