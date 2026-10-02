/**
 * P1 — Tests d'intégration API (contre un serveur Strapi en cours d'exécution).
 *
 * Démarrage préalable :  npm run develop   (ou npx strapi develop --no-build-admin)
 * Exécution :            node --test tests/p1-api.test.cjs
 *
 * Variables d'environnement :
 *   STRAPI_URL   (défaut http://localhost:1337)
 *   ADMIN_EMAIL / ADMIN_PASSWORD  (compte du rôle « Administrateur »)
 *   USER_EMAIL / USER_PASSWORD    (compte Authenticated non habilité)
 *
 * Ces comptes existent dans la base dev (migrate-users.ts) :
 *   admin.test@mtefop.mg / TestAdmin2026!   → rôle Administrateur
 *   user.test@mtefop.mg  / TestUser2026!    → rôle Authenticated
 *
 * Le fichier se SAUTE proprement si le serveur ne répond pas : un échec
 * d'environnement ne doit jamais être rapporté comme un succès de test.
 *
 * Couverture P1 :
 *  1. fiche par URL directe (/api/documents/:id — forme legacy) ;
 *  2. document inexistant → 404 ;
 *  3. création : statut imposé « non_verifie » (même admin) + etat brouillon ;
 *  4. PATCH générique : « status » ignoré (pas de contournement du circuit) ;
 *  5. validation juridique REFUSÉE à un rôle non habilité (403) ;
 *  6. validation juridique refusée SANS justification (400) ;
 *  7. validation juridique ACCEPTÉE AVEC justification + audit persisté ;
 *  8. historique de statut conservé (append-only) ;
 *  9. document créé sans PDF : aucune URL de fichier morte exposée.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

// 127.0.0.1 explicitement : « localhost » peut résoudre en ::1 (IPv6) alors
// que Strapi écoute sur IPv4 uniquement (ECONNREFUSED ::1 constaté sous Windows).
const BASE = process.env.STRAPI_URL || 'http://127.0.0.1:1337';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin.test@mtefop.mg';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestAdmin2026!';
const USER_EMAIL = process.env.USER_EMAIL || 'user.test@mtefop.mg';
const USER_PASSWORD = process.env.USER_PASSWORD || 'TestUser2026!';

// Sonde de disponibilité (promesse résolue une seule fois, avant les tests).
const probe = () =>
  new Promise((resolve) => {
    try {
      const u = new URL(`${BASE}/api/documents/?page_size=1`);
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
let adminToken = null;
let userToken = null;

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
};

const login = async (email, password) => {
  const res = await fetch(`${BASE}/api/v1/auth/jwt/create/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.access || null;
};

// Skip propre test par test si le serveur est absent.
const requireServer = (t) => {
  if (!serverUp) t.skip(`serveur Strapi absent sur ${BASE}`);
};

describe('P1 — Fiche documentaire à URL stable (endpoint legacy)', () => {
  before(async () => {
    serverUp = await probe();
    if (serverUp) adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    else
      console.warn(
        `\n[p1-api] ⚠️ Serveur Strapi injoignable sur ${BASE} — tests API SAUTÉS (démarrer « npm run develop »).\n`
      );
  });

  test('liste anonyme : aucune notice non validée ne fuit au public', async (t) => {
    requireServer(t);
    const res = await api('/api/documents/?page_size=10');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.results));
    // Règle P1 : seules les notices « validees » sont publiques. En base dev,
    // toutes les notices migrées sont « brouillon » → le public n'en voit AUCUNE
    // (c'est voulu : la validation éditoriale reste à faire par le ministère).
    for (const d of res.data.results) {
      assert.strictEqual(d.etat_notice, 'validee');
    }
  });

  test('GET /api/documents/ (admin) : les notices existent et portent les champs P1', async (t) => {
    requireServer(t);
    assert.ok(adminToken, 'login admin requis');
    const res = await api('/api/documents/?page_size=5', { token: adminToken });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.count >= 1, 'la base de test doit contenir des documents');
    assert.ok(Array.isArray(res.data.results));
  });

  test('GET /api/documents/:id — fiche directe par URL (métadonnées + relations)', async (t) => {
    requireServer(t);
    const list = await api('/api/documents/?page_size=1', { token: adminToken });
    assert.ok(list.data.results?.length >= 1, 'au moins un document côté admin');
    const id = list.data.results[0].id;
    const res = await api(`/api/documents/${id}/`, { token: adminToken });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(Number(res.data.id), Number(id));
    // Champs P1 présents dans la réponse
    assert.ok('status' in res.data);
    assert.ok('etat_notice' in res.data);
    assert.ok('relations_actives' in res.data);
    assert.ok('relations_passives' in res.data);
  });

  test('GET /api/documents/999999 — document inexistant → 404', async (t) => {
    requireServer(t);
    const res = await api('/api/documents/999999/');
    assert.strictEqual(res.status, 404);
  });
});

describe('P1 — Présomption nulle et circuit de validation juridique', () => {
  let createdId = null;

  before(async () => {
    serverUp = serverUp || (await probe());
    if (serverUp) {
      adminToken = adminToken || (await login(ADMIN_EMAIL, ADMIN_PASSWORD));
      userToken = userToken || (await login(USER_EMAIL, USER_PASSWORD));
    }
  });

  after(async () => {
    if (createdId && serverUp && adminToken) {
      await api(`/api/documents/${createdId}/`, { method: 'DELETE', token: adminToken });
    }
  });

  test('création (admin) : le statut envoyé est IGNORÉ → non_verifie + brouillon', async (t) => {
    requireServer(t);
    assert.ok(adminToken, 'login admin requis');
    const res = await api('/api/documents/', {
      method: 'POST',
      token: adminToken,
      body: {
        type: 'note',
        objet: `TEST P1 auto — présomption nulle (${Date.now()})`,
        numero: `P1TEST-${Date.now()}`,
        date: '2026-01-01',
        // Tentative de forcer un statut juridique à la création :
        status: 'en_vigueur', // ← doit être ignoré côté serveur
      },
    });
    assert.strictEqual(res.status, 201);
    createdId = res.data.id;
    assert.strictEqual(res.data.status, 'non_verifie', 'présomption nulle imposée');
    assert.strictEqual(res.data.etat_notice, 'brouillon', 'notice en brouillon imposée');
  });

  test('PATCH générique : « status » ne contourne PAS le circuit de validation', async (t) => {
    requireServer(t);
    assert.ok(createdId);
    const res = await api(`/api/documents/${createdId}/`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'abroge', objet: 'TEST P1 — objet mis à jour' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.data.status,
      'non_verifie',
      'le statut juridique est inchangé via le PATCH générique'
    );
  });

  test('validation juridique REFUSÉE au rôle non habilité (403)', async (t) => {
    requireServer(t);
    assert.ok(userToken, 'login usager simple requis');
    const res = await api(`/api/documents/${createdId}/status/`, {
      method: 'PATCH',
      token: userToken,
      body: { status: 'en_vigueur', justification: 'tentative non autorisée' },
    });
    assert.strictEqual(res.status, 403);
  });

  test('validation juridique REFUSÉE sans justification (400)', async (t) => {
    requireServer(t);
    const res = await api(`/api/documents/${createdId}/status/`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'en_vigueur' }, // pas de justification
    });
    assert.strictEqual(res.status, 400);
  });

  test('validation juridique ACCEPTÉE avec justification (rôle habilité)', async (t) => {
    requireServer(t);
    const res = await api(`/api/documents/${createdId}/status/`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        status: 'en_vigueur',
        justification: 'TEST AUTOMATISÉ P1 — vérification du circuit (à ne pas reproduire)',
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'en_vigueur');
  });

  test("historique de statut : la trace d'audit est conservée (append-only)", async (t) => {
    requireServer(t);
    const res = await api(`/api/documents/${createdId}/statut-historique/`, {
      token: adminToken,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.count >= 1, 'au moins une entrée d audit');
    const last = res.data.results[0];
    assert.strictEqual(last.nouveau_statut, 'en_vigueur');
    assert.ok(last.justification && String(last.justification).includes('TEST AUTOMATISÉ P1'));
    assert.ok(last.auteur, 'auteur tracé');
    assert.ok(last.created_at, 'date tracée');
  });

  test("document sans PDF : aucune URL de fichier morte n'est exposée", async (t) => {
    requireServer(t);
    // Consultation AVEC un rôle habilité (une notice brouillon est masquée au
    // public — testé séparément ci-dessus).
    const res = await api(`/api/documents/${createdId}/`, { token: adminToken });
    assert.strictEqual(res.status, 200);
    const file = res.data.pdf_file || res.data.fichier;
    assert.ok(
      file === null || file === undefined || file === 'null' || file === '',
      'aucun fichier factice ne doit être rattaché'
    );
  });
});
