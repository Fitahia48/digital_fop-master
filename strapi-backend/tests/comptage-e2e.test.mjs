/**
 * Tests d'intégration du comptage « 1 visiteur = 1 par jour » (Étape 8).
 *
 * Cible : un Strapi de TEST ISOLÉ sur la copie `.tmp-test/data.db`
 * (la base de développement n'est pas touchée), démarré par le orchestrateur :
 *
 *   Phase A : TRUST_PROXY=true, jour courant réel
 *   Phase B : TRUST_PROXY=true, VISITOR_JOUR_FIXE=<lendemain> (bascule de jour)
 *   Phase C : TRUST_PROXY absent  (le X-Forwarded-For doit être IGNORÉ)
 *
 *   node tests/comptage-e2e.test.mjs A
 *   node tests/comptage-e2e.test.mjs B
 *   node tests/comptage-e2e.test.mjs C
 *
 * Variables : TEST_BASE (défaut http://127.0.0.1:1340), TEST_JOUR (jour forc),
 * TEST_LOG (fichier journal du serveur à vérifier — pas d'IP en clair).
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase = (process.argv[2] || 'A').toUpperCase();
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:1340';
const LOG = process.env.TEST_LOG || '';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IP_SPF = '203.0.113.7'; // IP de test (X-Forwarded-For falsifiable)
const IP_SPF2 = '198.51.100.99';

const jourReel = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const JOUR = process.env.TEST_JOUR || jourReel();

const db = new Database(path.join(racine, '.tmp-test', 'data.db'), {
  readonly: true,
  timeout: 5000,
});

const un = (sql, ...p) => db.prepare(sql).get(...p);
const post = async (p, { ip, ua = UA } = {}) => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'user-agent': ua, ...(ip ? { 'x-forwarded-for': ip } : {}) },
  });
  let corps = null;
  try {
    corps = await r.json();
  } catch {
    /* réponse vide */
  }
  return { status: r.status, body: corps };
};
const get = async (p, token) => {
  const r = await fetch(BASE + p, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  let corps = null;
  try {
    corps = await r.json();
  } catch {
    /* réponse vide */
  }
  return { status: r.status, body: corps };
};

const compteurs = () => ({
  visiteursJour: un('SELECT COUNT(*) AS n FROM visites_visiteurs WHERE jour = ?', JOUR)?.n ?? 0,
  doc11: un('SELECT visits FROM strapi_documents WHERE id = 11')?.visits ?? -1,
  doc12: un('SELECT visits FROM strapi_documents WHERE id = 12')?.visits ?? -1,
  doc13: un('SELECT visits FROM strapi_documents WHERE id = 13')?.visits ?? -1,
  doc14: un('SELECT visits FROM strapi_documents WHERE id = 14')?.visits ?? -1,
  daily: un('SELECT total_visits, unique_visitors FROM daily_stats WHERE visit_date = ?', JOUR) ?? {
    total_visits: 0,
    unique_visitors: 0,
  },
  totaux: un('SELECT visiteurs, consultations FROM totaux_jour WHERE jour = ?', JOUR) ?? {
    visiteurs: 0,
    consultations: 0,
  },
});

let total = 0;
let echecs = 0;
const verifie = (condition, libelle, detail = '') => {
  total += 1;
  if (condition) {
    console.log(`  ✔ ${libelle}`);
  } else {
    echecs += 1;
    console.error(`  ✘ ${libelle}${detail ? ` — ${detail}` : ''}`);
  }
};
const attendu = (recu, attendu_, libelle) =>
  verifie(
    JSON.stringify(recu) === JSON.stringify(attendu_),
    libelle,
    `reçu ${JSON.stringify(recu)}, attendu ${JSON.stringify(attendu_)}`
  );

console.log(`\n══ Phase ${phase} — jour visé : ${JOUR} — ${BASE} ══`);
const av = compteurs();

// ─── Phase A ────────────────────────────────────────────────────────────────
if (phase === 'A') {
  // 1. Même IP, 10 ouvertures de l'application → 1 visiteur du jour
  const pings = [];
  for (let i = 0; i < 10; i += 1) pings.push(await post('/api/visites/ping'));
  attendu(
    pings.map((r) => r.body?.counted),
    [true, ...Array(9).fill(false)],
    'A1 : 10 pings même IP → compté UNE seule fois'
  );
  const ap = compteurs();
  verifie(ap.visiteursJour === av.visiteursJour + 1, 'A1 : visites_visiteurs +1 ligne', `${av.visiteursJour} → ${ap.visiteursJour}`);
  verifie(
    ap.daily.total_visits === av.daily.total_visits + 10,
    'A1 : daily_stats.total_visits +10 (une ouverture = un ping)',
    `${av.daily.total_visits} → ${ap.daily.total_visits}`
  );
  verifie(
    ap.daily.unique_visitors === av.daily.unique_visitors + 1,
    'A1 : daily_stats.unique_visitors +1',
    `${av.daily.unique_visitors} → ${ap.daily.unique_visitors}`
  );
  verifie(
    ap.totaux.visiteurs === av.totaux.visiteurs + 1,
    'A1 : totaux_jour.visiteurs +1',
    `${av.totaux.visiteurs} → ${ap.totaux.visiteurs}`
  );

  // 2. Les GET ne comptent plus rien (ancien middleware)
  for (let i = 0; i < 3; i += 1) await get('/api/documents/?pagination[pageSize]=1');
  const ag = compteurs();
  verifie(
    ag.daily.total_visits === ap.daily.total_visits && ag.visiteursJour === ap.visiteursJour,
    'A2 : 3 GET publics → aucun comptage (plus de comptage par requête)',
    `total_visits ${ap.daily.total_visits} → ${ag.daily.total_visits}`
  );

  // 3. Texte A ouvert 5 fois → +1 ; texte B → +1 (textes différents = 2 comptages)
  const a5 = [];
  for (let i = 0; i < 5; i += 1) a5.push(await post('/api/documents/11/visit'));
  attendu(
    a5.map((r) => r.body?.counted),
    [true, false, false, false, false],
    'A3 : texte A ouvert 5 fois → compté 1 fois'
  );
  const b1 = await post('/api/documents/12/visit');
  verifie(b1.body?.counted === true, 'A4 : texte B (même jour) → compté (comptage par texte)');
  const a = compteurs();
  verifie(a.doc11 === av.doc11 + 1, 'A3 : documents.visits de A +1', `${av.doc11} → ${a.doc11}`);
  verifie(a.doc12 === av.doc12 + 1, 'A4 : documents.visits de B +1', `${av.doc12} → ${a.doc12}`);
  verifie(
    a.totaux.consultations === av.totaux.consultations + 2,
    'A3/A4 : totaux_jour.consultations +2',
    `${av.totaux.consultations} → ${a.totaux.consultations}`
  );

  // 4. Concurrence : 5 requêtes simultanées pour le même texte → un seul comptage
  const paralleles = await Promise.all(
    Array.from({ length: 5 }, () => post('/api/documents/13/visit'))
  );
  const comptes = paralleles.filter((r) => r.body?.counted === true).length;
  verifie(comptes === 1, 'A5 : 5 requêtes SIMULTANÉES → exactement 1 comptage', `comptés=${comptes}`);
  const c = compteurs();
  verifie(c.doc13 === av.doc13 + 1, 'A5 : concurrence → visits +1 (pas de perte ni de doublon)', `${av.doc13} → ${c.doc13}`);

  // 5. Autre IP (X-Forwarded-For, TRUST_PROXY=true) → +1 visiteur, +1 consultation
  const pingIp2 = await post('/api/visites/ping', { ip: IP_SPF });
  verifie(pingIp2.body?.counted === true, 'A6 : 2e IP (XFF accepté) → nouveau visiteur compté');
  const visA2 = await post('/api/documents/11/visit', { ip: IP_SPF });
  verifie(visA2.body?.counted === true, 'A6 : 2e IP → +1 consultation du texte A');
  const c2 = compteurs();
  verifie(
    c2.visiteursJour === a.visiteursJour + 1,
    'A6 : visites_visiteurs +1 ligne pour la 2e IP',
    `${a.visiteursJour} → ${c2.visiteursJour}`
  );
  verifie(c2.doc11 === a.doc11 + 1, 'A6 : texte A +1 pour la 2e IP', `${a.doc11} → ${c2.doc11}`);

  // 6. Robots non comptés
  const robot1 = await post('/api/visites/ping', { ua: 'curl/8.21.0' });
  const robot2 = await post('/api/visites/ping', { ua: 'HeadlessChrome/120.0.0.0' });
  const robot3 = await post('/api/documents/11/visit', { ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  verifie(
    robot1.body?.counted === false && robot2.body?.counted === false && robot3.body?.counted === false,
    'A7 : User-Agents robots (curl, headless, googlebot) → non comptés'
  );
  const r = compteurs();
  verifie(r.visiteursJour === c2.visiteursJour && r.doc11 === c2.doc11, 'A7 : aucun comptage produit par les robots');

  // 7. Brouillon non consultable → 404, non compté
  const bro = await post('/api/documents/14/visit');
  verifie(bro.status === 404, 'A8 : document brouillon → 404', `status=${bro.status}`);
  const br = compteurs();
  verifie(br.doc14 === av.doc14, 'A8 : brouillon → visits inchangés', `${av.doc14} → ${br.doc14}`);

  // 8. Verrous d'accès (inchangés)
  const statsAnon = await get('/api/visit-statistics/');
  verifie(
    statsAnon.status === 401 || statsAnon.status === 403,
    'A9 : /api/visit-statistics anonyme → refusé (401/403)',
    `status=${statsAnon.status}`
  );
  const transAnon = await get('/api/transparence/stats/');
  verifie(
    transAnon.status === 401 || transAnon.status === 403,
    'A9 : /api/transparence/stats anonyme → refusé',
    `status=${transAnon.status}`
  );
  const liste = await get('/api/documents/?pagination[pageSize]=1');
  verifie(liste.status === 200, 'A9 : routes publiques toujours OK (liste documents 200)', `status=${liste.status}`);
  const most = await get('/api/most-visited/');
  verifie(most.status === 200, 'A9 : /api/most-visited toujours OK', `status=${most.status}`);

  // 9. Statistiques admin : champs d'API inchangés + cohérence
  const login = await fetch(`${BASE}/api/auth/local`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin.test@mtefop.mg', password: 'TestAdmin2026!' }),
  });
  const loginBody = await login.json().catch(() => ({}));
  verifie(login.status === 200 && !!loginBody.jwt, 'A10 : connexion admin de test', `status=${login.status}`);
  if (loginBody.jwt) {
    const st = await get('/api/visit-statistics/', loginBody.jwt);
    verifie(st.status === 200, 'A10 : /api/visit-statistics admin → 200', `status=${st.status}`);
    const champs = [
      'total_visits',
      'unique_visitors',
      'total_visits_per_day',
      'unique_visitors_per_day',
      'visits_today',
      'visitors_online',
    ];
    verifie(
      st.body && champs.every((c) => c in st.body),
      'A10 : champs d API inchangés',
      st.body ? Object.keys(st.body).join(',') : 'corps vide'
    );
    const attenduAuj = un('SELECT COUNT(*) AS n FROM visites_visiteurs WHERE jour = ?', JOUR)?.n ?? 0;
    verifie(
      st.body?.visits_today === attenduAuj,
      'A10 : visits_today = visiteurs distincts du jour',
      `api=${st.body?.visits_today} db=${attenduAuj}`
    );
    verifie(
      Array.isArray(st.body?.unique_visitors_per_day) &&
        st.body.unique_visitors_per_day.every((l) => 'visit_date' in l && 'count' in l),
      'A10 : série unique_visitors_per_day aux formats visit_date/count'
    );
    verifie(
      Array.isArray(st.body?.total_visits_per_day) &&
        st.body.total_visits_per_day.every((l) => 'visit_date' in l && 'count' in l),
      'A10 : série total_visits_per_day aux formats visit_date/count'
    );
  }

  // 10. Aucune IP en clair : colonnes + journaux
  const colonnes = db.prepare('PRAGMA table_info(visites_visiteurs)').all().map((c) => c.name);
  const colonnes2 = db.prepare('PRAGMA table_info(consultations_visiteurs)').all().map((c) => c.name);
  const sansIp = [...colonnes, ...colonnes2].every((c) => !/ip|adresse/i.test(c));
  verifie(sansIp, 'A11 : aucune colonne IP dans les nouvelles tables', [...colonnes, ...colonnes2].join(','));
  const hashes = db
    .prepare('SELECT visiteur_hash FROM visites_visiteurs UNION SELECT visiteur_hash FROM consultations_visiteurs')
    .all();
  verifie(
    hashes.every((h) => /^[0-9a-f]{32}$/.test(h.visiteur_hash)),
    'A11 : toutes les empreintes sont hexadécimaux32 (pas d IP)',
    `${hashes.length} empreintes vérifiées`
  );
  if (LOG) {
    const fs = await import('node:fs');
    const journal = fs.readFileSync(LOG, 'utf8');
    verifie(
      !journal.includes(IP_SPF) && !journal.includes('203.0.113'),
      'A11 : le journal du serveur ne contient pas l IP spoofée',
      ''
    );
    verifie(
      !/x-forwarded-for/i.test(journal),
      'A11 : le journal ne journalise pas X-Forwarded-For',
      ''
    );
  }
}

// ─── Phase B : lendemain (bascule de jour) ──────────────────────────────────
if (phase === 'B') {
  verifie(
    (un("SELECT COUNT(*) AS n FROM visites_visiteurs WHERE jour = '2025-01-01'")?.n ?? -1) === 0,
    'B1 : purge au démarrage → empreinte de 2025-01-01 supprimée'
  );
  verifie(
    (un("SELECT COUNT(*) AS n FROM consultations_visiteurs WHERE jour = '2025-01-01'")?.n ?? -1) === 0,
    'B1 : purge → consultation de 2025-01-01 supprimée'
  );
  verifie(
    (un("SELECT COUNT(*) AS n FROM totaux_jour WHERE jour = '2025-01-01'")?.n ?? -1) === 1,
    'B1 : totaux_jour JAMAIS purgé (ligne 2025-01-01 conservée)'
  );

  // Même IP que la veille → comptée de nouveau le jour suivant
  const ping = await post('/api/visites/ping');
  verifie(ping.body?.counted === true, 'B2 : même IP, jour suivant → visit comptée de nouveau');
  const visite = await post('/api/documents/11/visit');
  verifie(visite.body?.counted === true, 'B2 : même texte, jour suivant → consultation recomptée');

  // …mais toujours 1 fois dans la journée
  const ping2 = await post('/api/visites/ping');
  const visite2 = await post('/api/documents/11/visit');
  verifie(
    ping2.body?.counted === false && visite2.body?.counted === false,
    'B3 : nouveau jour → toujours dédoublonné dans la même journée'
  );
  verifie(
    (un('SELECT COUNT(*) AS n FROM visites_visiteurs WHERE jour = ?', JOUR)?.n ?? 0) === 1,
    'B3 : visites_visiteurs du jour = 1 ligne'
  );

  // Statistiques admin : visits_today = jour VISÉ (jourCourant injecté)
  const login = await fetch(`${BASE}/api/auth/local`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin.test@mtefop.mg', password: 'TestAdmin2026!' }),
  });
  const loginBody = await login.json().catch(() => ({}));
  if (loginBody.jwt) {
    const st = await get('/api/visit-statistics/', loginBody.jwt);
    verifie(
      st.body?.visits_today === (un('SELECT COUNT(*) AS n FROM visites_visiteurs WHERE jour = ?', JOUR)?.n ?? 0),
      'B4 : visits_today = visiteurs du jour FORCÉ (injection du jour)',
      `api=${st.body?.visits_today}`
    );
    verifie(
      (st.body?.unique_visitors_per_day ?? []).some(
        (l) => String(l.visit_date).slice(0, 10) === JOUR
      ),
      'B4 : la série par jour contient le jour courant'
    );
  } else {
    verifie(false, 'B4 : connexion admin', `status=${login.status}`);
  }
}

// ─── Phase C : TRUST_PROXY absent → X-Forwarded-For ignoré ──────────────────
if (phase === 'C') {
  const ping = await post('/api/visites/ping', { ip: IP_SPF2 });
  verifie(
    ping.body?.counted === false,
    'C1 : TRUST_PROXY=false → X-Forwarded-For IGNORÉ (même visiteur 127.0.0.1 déjà compté)',
    `counted=${ping.body?.counted}`
  );
  // Le texte 11 a déjà été compté pour ce visiteur (phase B, même jour visé)
  const visite = await post('/api/documents/11/visit', { ip: IP_SPF2 });
  verifie(
    visite.body?.counted === false,
    'C2 : TRUST_PROXY=false → pas de nouveau comptage via en-tête spoofé',
    `counted=${visite.body?.counted}`
  );
  const sansEntete = await post('/api/visites/ping');
  verifie(
    sansEntete.body?.counted === false,
    'C3 : sans en-tête, toujours non compté (même jour, même visiteur)'
  );
}

db.close();
console.log(`\nPhase ${phase} : ${total - echecs}/${total} vérifications OK${echecs ? ` — ${echecs} ÉCHEC(S)` : ''}`);
process.exit(echecs ? 1 : 0);
