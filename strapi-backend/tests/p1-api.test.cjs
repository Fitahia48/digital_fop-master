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
 *  3. création : statut accepté (en_vigueur / abroge) ; repli sur
 *     « en_vigueur » si valeur absente ou invalide (jamais d'erreur) ;
 *  4. PATCH générique : « status » accepté (édition directe du statut) ;
 *  5. validation juridique REFUSÉE à un rôle non habilité (403) ;
 *  6. changement de statut ACCEPTÉ SANS justification (plus de 400) ;
 *  7. changement de statut AVEC justification + audit persisté ;
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

describe('P1 — Statut juridique simplifié (choix direct du formulaire)', () => {
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

  test('création (admin) : le statut envoyé est ACCEPTÉ (en_vigueur)', async (t) => {
    requireServer(t);
    assert.ok(adminToken, 'login admin requis');
    const res = await api('/api/documents/', {
      method: 'POST',
      token: adminToken,
      body: {
        type: 'note',
        objet: `TEST P1 auto — statut choisi à la création (${Date.now()})`,
        numero: `P1TEST-${Date.now()}`,
        date: '2026-01-01',
        // Choix du formulaire d'ajout : « En vigueur »
        status: 'en_vigueur',
      },
    });
    assert.strictEqual(res.status, 201);
    createdId = res.data.id;
    assert.strictEqual(res.data.status, 'en_vigueur', 'statut choisi enregistré');
    // etat_notice : décision produit documentée dans le controller create —
    // une notice créée par un admin est directement « validée » (visible
    // immédiatement) ; un non-admin resterait en « brouillon ».
    assert.strictEqual(res.data.etat_notice, 'validee', 'notice admin validée immédiatement');
  });

  test('création : statut « abroge » accepté, puis repli sur « en_vigueur » si valeur invalide', async (t) => {
    requireServer(t);
    assert.ok(adminToken, 'login admin requis');
    const mk = (status) =>
      api('/api/documents/', {
        method: 'POST',
        token: adminToken,
        body: {
          type: 'note',
          objet: `TEST P1 auto — repli statut ${String(status)} (${Date.now()})`,
          numero: `P1TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          date: '2026-01-01',
          ...(status === undefined ? {} : { status }),
        },
      });

    const abroge = await mk('abroge');
    assert.strictEqual(abroge.status, 201);
    assert.strictEqual(abroge.data.status, 'abroge', '« abroge » accepté');

    const invalide = await mk('statut_inconnu');
    assert.strictEqual(invalide.status, 201, 'jamais d erreur pour un statut invalide');
    assert.strictEqual(invalide.data.status, 'en_vigueur', 'repli explicite en_vigueur');

    const absent = await mk(undefined);
    assert.strictEqual(absent.status, 201);
    assert.strictEqual(absent.data.status, 'en_vigueur', 'repli par défaut en_vigueur');

    // Nettoyage des documents de test créés ici
    for (const r of [abroge, invalide, absent]) {
      if (r.data?.id) await api(`/api/documents/${r.data.id}/`, { method: 'DELETE', token: adminToken });
    }
  });

  test('PATCH générique : « status » est accepté (édition directe du statut)', async (t) => {
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
      'abroge',
      'le statut juridique est modifiable via le formulaire d édition'
    );
    // Valeur absente → statut actuel conservé (pas de réécriture silencieuse)
    const keep = await api(`/api/documents/${createdId}/`, {
      method: 'PATCH',
      token: adminToken,
      body: { objet: 'TEST P1 — objet mis à jour (bis)' },
    });
    assert.strictEqual(keep.status, 200);
    assert.strictEqual(keep.data.status, 'abroge', 'statut inchangé si status absent');
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

  test('changement de statut ACCEPTÉ SANS justification (plus de 400)', async (t) => {
    requireServer(t);
    const res = await api(`/api/documents/${createdId}/status/`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'en_vigueur' }, // pas de justification : désormais optionnelle
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'en_vigueur');
  });

  test('changement de statut AVEC justification (rôle habilité) + audit', async (t) => {
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
    // La dernière écriture (justification fournie) doit être présente — on
    // cherche dans les entrées récentes pour rester insensible à l'ordre des
    // timestamps de milliseconde.
    const tracee = res.data.results.find(
      (r) => r.justification && String(r.justification).includes('TEST AUTOMATISÉ P1')
    );
    assert.ok(tracee, 'la justification fournie est journalisée');
    assert.strictEqual(tracee.nouveau_statut, 'en_vigueur');
    assert.ok(tracee.auteur, 'auteur tracé');
    assert.ok(tracee.created_at, 'date tracée');
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
