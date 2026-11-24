import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Vérification de l'harmonisation des statistiques (page unique à onglets).
 *
 * Parcours RÉELS via Vite (BASE_URL, défaut http://localhost:5173) :
 *   1. anonyme  → /admin/statistiques et /transparence redirigent (verrou
 *                 inchangé), aucun compteur sur l'accueil.
 *   2. admin    → login : dashboard avec raccourcis Statistiques/Transparence,
 *                 anciennes sections supprimées, compteur harmonisé.
 *   3. /admin/statistiques (navigation client) : 4 onglets, cartes, graphiques,
 *                 chiffres IDENTIQUES à l'API, libellés i18n, tri accessible.
 *   4. /transparence : panneau Consultations partagé, en-tête + engagement.
 *   5. cas limites : erreur API → Réessayer ; période sans données → message
 *                 vide ; pas de « NaN » ; pas de débordement 375/768/1280 px.
 *
 * NB : un rechargement direct (goto) d'une route protégée rebondit vers le
 * dashboard (comportement préexistant de ProtectedRoute + Login) — on
 * navigue donc comme un utilisateur réel, par les liens de l'application.
 *
 * Identifiants admin lus depuis strapi-backend/tests/mailer-e2e.test.cjs —
 * JAMAIS affichés dans la sortie.
 */
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const STRAPI = process.env.STRAPI_URL || 'http://localhost:1337';
const spec = readFileSync(new URL('../../strapi-backend/tests/mailer-e2e.test.cjs', import.meta.url), 'utf8');
const ADMIN_EMAIL = spec.match(/ADMIN_PANEL_EMAIL \|\| '([^']+)'/)?.[1];
const ADMIN_PASSWORD = spec.match(/ADMIN_PANEL_PASSWORD \|\| '([^']+)'/)?.[1];
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('FAIL — identifiants de test introuvables dans mailer-e2e.test.cjs');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failed = 0;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!cond) failed += 1;
};
const chiffres = (s) => String(s ?? '').replace(/\D/g, '');
// Première valeur numérique d'un texte de carte (avant le libellé).
const premiereValeur = (s) => String(s ?? '').match(/^\d[\d\u00a0\u202f ]*/)?.[0] ?? '';
const CARTES_CONSULTATIONS = ['Consultations de textes', 'Téléchargements de fichiers', 'Textes publiés', 'Textes déjà consultés'];

async function login(page) {
  await page.goto(`${BASE}/portail-gestion/connexion`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 25000 });
  await page.waitForTimeout(1000);
}

// ─── 1. Anonyme : verrous inchangés, aucun compteur ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const url of ['/admin/statistiques', '/transparence']) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(600);
    const path = new URL(page.url()).pathname;
    assert(path === '/portail-gestion/connexion', `anonyme ${url} → redirection connexion (${path})`);
  }
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const compteurs = await page.locator('.fixed-visits').count();
  assert(compteurs === 0, `anonyme accueil : aucun compteur de visiteurs (${compteurs})`);
  await ctx.close();
}

// ─── 2 & 3. Admin : dashboard + page à onglets ─────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const erreursConsole = [];
page.on('pageerror', (e) => erreursConsole.push(String(e)));

await login(page);

// Dashboard : raccourcis + anciennes sections supprimées + compteur harmonisé
{
  const texte = await page.locator('#contenu-principal').innerText();
  assert(texte.includes('Statistiques') && texte.includes('Transparence'), 'dashboard : raccourcis « Statistiques » et « Transparence » présents');
  assert(!texte.includes('Reporting'), 'dashboard : ancienne section « Reporting » supprimée');
  assert(!texte.includes('Statistiques des Textes'), 'dashboard : ancien bloc StatistiqueDocs supprimé');
  assert(!texte.includes('a augmenté'), 'dashboard : ligne « objectif 200 » supprimée');
  const carte = await page.getByText(/Visiteurs aujourd/).count();
  assert(carte > 0, 'dashboard : compteur « Visiteurs aujourd’hui » avec libellé explicite');
  const aideNuit = await page.getByText('remis à zéro chaque nuit').count();
  assert(aideNuit > 0, 'dashboard : aide « remis à zéro chaque nuit » visible');
  const direct = await page.getByText('en direct', { exact: true }).count();
  assert(direct > 0, 'dashboard : indicateur « en direct » discret');
  const valeurCarte = await page.locator('.tabular-nums').first().innerText();
  assert(/^\d+([\u00a0\u202f ]\d{3})*$/.test(valeurCarte.trim()), `dashboard : valeur du compteur formatée (${valeurCarte.trim()})`);
}

// Raccourci « Statistiques » → /admin/statistiques (navigation client)
{
  await page.getByRole('link', { name: 'Statistiques' }).first().click();
  await page.waitForURL('**/admin/statistiques**', { timeout: 15000 });
  await page.waitForSelector('#panneau-visiteurs', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const onglets = await page.locator('[role="tab"]').allTextContents();
  assert(
    ['Visiteurs', 'Textes', 'Consultations', 'Corps'].every((o) => onglets.some((x) => x.includes(o))),
    `4 onglets présents (${onglets.map((o) => o.trim()).join(' / ')})`
  );

  const h1 = await page.getByRole('heading', { name: 'Statistiques', level: 1 }).innerText();
  assert(h1.includes('Statistiques'), `titre de page (${h1})`);

  const aide = await page.locator('details summary').first().innerText();
  assert(aide.includes('Comment lire'), 'bloc « Comment lire cette page ? » présent');

  // Cartes de chiffres clés (Visiteurs) + comparaison directe avec l'API
  const api = await page.evaluate(async ({ STRAPI }) => {
    const token = JSON.parse(localStorage.getItem('user') || '{}')?.access;
    const r = await fetch(`${STRAPI}/api/visit-statistics/?start_date=&end_date=`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json();
  }, { STRAPI });

  const cartes = await page.locator('#panneau-visiteurs .grid > div').allTextContents();
  const texteCartes = cartes.join(' | ');
  assert(/Visiteurs aujourd/.test(texteCartes), 'carte « Visiteurs aujourd’hui » présente');
  assert(texteCartes.includes('Visiteurs différents'), 'carte « Visiteurs différents » présente');
  assert(
    chiffres(premiereValeur(cartes[0])) === String(api.visits_today ?? 0),
    `carte du jour identique à l'API (${chiffres(premiereValeur(cartes[0]))} vs ${api.visits_today})`
  );
  const carteUniques = cartes.find((c) => c.includes('Visiteurs différents')) || '';
  assert(chiffres(premiereValeur(carteUniques)) === String(api.unique_visitors ?? 0), `carte visiteurs différents identique à l'API (${api.unique_visitors})`);
  const carteVisites = cartes.find((c) => c.includes('Visites') && !c.includes('Visiteur')) || '';
  assert(chiffres(premiereValeur(carteVisites)) === String(api.total_visits ?? 0), `carte visites totales identique à l'API (${api.total_visits})`);

  // Graphique (ou état vide honnête si aucune donnée) + aucun « NaN »/objectif
  const aCanvas = await page.locator('#panneau-visiteurs canvas').count();
  const aVide = await page.getByText('Pas encore de données pour cette période.').count();
  assert(aCanvas >= 1 || aVide >= 1, `onglet Visiteurs : courbe ou état vide (${aCanvas} canvas / ${aVide} vide)`);
  const textePage = await page.locator('#panneau-visiteurs').innerText();
  assert(!textePage.includes('NaN'), 'aucun « NaN » affiché');
  assert(!textePage.includes('augmenté'), 'plus de ligne « le nombre de visites a augmenté… »');

  // Sélecteur de période : « 30 jours » sans erreur
  await page.locator('#panneau-visiteurs').getByRole('button', { name: '30 jours' }).click();
  await page.waitForTimeout(1500);
  const apres30 = await page.locator('#panneau-visiteurs').innerText();
  assert(!apres30.includes('Impossible de charger'), 'période « 30 jours » : pas d\'erreur');
  await page.locator('#panneau-visiteurs').getByRole('button', { name: /Tout l/ }).click();
  await page.waitForTimeout(1000);

  // Onglet Textes
  await page.getByRole('tab', { name: /Textes/ }).click();
  await page.waitForSelector('#panneau-textes', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const textePanel = await page.locator('#panneau-textes').innerText();
  assert(textePanel.includes('Total des textes'), 'onglet Textes : carte total présente');
  const tCanvas = await page.locator('#panneau-textes canvas').count();
  const tVide = await page.getByText("Comparaison des textes ajoutés").count();
  assert(tCanvas >= 1 || tVide >= 1, `onglet Textes : barres ou aide affichée (${tCanvas} canvas)`);
  const option = await page.locator('#stats-type-select option[value="decret"]').innerText();
  assert(option === 'Décret', `type affiché en libellé (« ${option} », pas « decret »)`);
  await page.selectOption('#stats-type-select', 'decret');
  await page.waitForTimeout(1200);
  const apiType = await page.evaluate(async ({ STRAPI }) => {
    const token = JSON.parse(localStorage.getItem('user') || '{}')?.access;
    const r = await fetch(`${STRAPI}/api/document-stats/?type=decret`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json();
  }, { STRAPI });
  const blocType = await page.locator('#stats-textes-repartition .max-w-md').first().innerText().catch(() => '');
  assert(chiffres(blocType) === String(apiType.count ?? 0), `comptage « décret » identique à l'API (${apiType.count})`);

  // Onglet Consultations : 4 cartes conformes à l'API transparence
  await page.getByRole('tab', { name: /Consultations/ }).click();
  await page.waitForSelector('#panneau-consultations', { timeout: 10000 });
  const apiTransp = await page.evaluate(async ({ STRAPI }) => {
    const token = JSON.parse(localStorage.getItem('user') || '{}')?.access;
    const r = await fetch(`${STRAPI}/api/transparence/stats/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.json();
  }, { STRAPI });
  await page.locator('#stats-top-consultes table').waitFor({ timeout: 15000 }).catch(() => {});
  const cartesC = await page.locator('#panneau-consultations .grid > div').allTextContents();
  assert(chiffres((cartesC[0] || '').split('\n')[0]) === String(apiTransp.total_consultations ?? 0), `carte consultations identique à l'API (${apiTransp.total_consultations})`);
  assert(chiffres((cartesC[1] || '').split('\n')[0]) === String(apiTransp.total_telechargements ?? 0), `carte téléchargements identique à l'API (${apiTransp.total_telechargements})`);
  const cCanvas = await page.locator('#panneau-consultations canvas').count();
  const cVide = await page.locator('#stats-consultations-type').getByText('Pas encore').count();
  assert(cCanvas >= 1 || cVide >= 1, `onglet Consultations : barres par type (${cCanvas} canvas)`);
  const ths = await page.locator('#panneau-consultations th[aria-sort]').count();
  assert(ths >= 1, `en-têtes de tableau triables (${ths} avec aria-sort)`);
  const captions = await page.locator('#panneau-consultations table caption').count();
  assert(captions >= 2, `tableaux avec <caption> (${captions})`);
  const tableTexte = await page.locator('#stats-consultations-tableau').innerText();
  assert(!tableTexte.includes('loi_organique'), 'plus de valeur brute « loi_organique » dans le tableau');

  // Onglet Corps
  await page.getByRole('tab', { name: /Corps/ }).click();
  await page.waitForSelector('#panneau-corps', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const corpsTexte = await page.locator('#panneau-corps').innerText();
  assert(corpsTexte.includes('Corps (organismes)'), 'onglet Corps : carte total présente');
  const rCorpsCanvas = await page.locator('#panneau-corps canvas').count();
  const rCorpsVide = await page.getByText("Comparaison des organismes ajoutés").count();
  assert(rCorpsCanvas >= 1 || rCorpsVide >= 1, `onglet Corps : barres présentes (${rCorpsCanvas} canvas)`);
  const tableCorps = await page.locator('#stats-corps-consultes table').count();
  const corpsVide = await page.getByText('Aucun corps consulté').count();
  assert(tableCorps >= 1 || corpsVide >= 1, `onglet Corps : tableau des corps consultés ou état vide (${tableCorps} table / ${corpsVide} vide)`);

  // Clavier : flèche droite depuis l'onglet actif
  await page.getByRole('tab', { name: /Visiteurs/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  const selectionne = await page.locator('[role="tab"][aria-selected="true"]').innerText();
  assert(selectionne.includes('Textes'), `flèche droite → onglet suivant (${selectionne.trim()})`);

  // Aucune clé i18n brute
  const html = await page.locator('#contenu-principal').innerText();
  assert(!/stats\.[a-z_]+/.test(html), 'aucune clé de traduction brute « stats.* » affichée');
}

// ─── 4. /transparence : panneau partagé + en-tête/engagement conservés ──────
{
  await page.goBack(); // retour client au dashboard
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.getByRole('link', { name: 'Transparence' }).first().click();
  await page.waitForURL('**/transparence**', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const texte = await page.locator('#contenu-principal').innerText();
  assert(texte.includes('Transparence et statistiques'), 'transparence : en-tête conservé');
  assert(/anonymat|personnelle|Engagement/i.test(texte), 'transparence : bloc engagement/anonymat conservé');
  await page.locator('main canvas, #stats-consultations-type').first().waitFor({ timeout: 15000 }).catch(() => {});
  const canvasT = await page.locator('main canvas').count();
  const videT = await page.getByText('Pas encore de données pour cette période.').count();
  assert(canvasT >= 1 || videT >= 1, `transparence : graphique ou état vide (${canvasT} canvas)`);
  const texteT = await page.locator('#contenu-principal').innerText();
  const cartesT = CARTES_CONSULTATIONS.filter((l) => texteT.includes(l)).length;
  assert(cartesT >= 4, `transparence : 4 cartes de chiffres clés (${cartesT}/4)`);
}

// ─── 5. Cas limites ────────────────────────────────────────────────────────
{
  // a) Erreur API → message + Réessayer, puis récupération
  await page.goBack(); // retour client au dashboard
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.route('**/api/transparence/stats/**', (route) => route.abort());
  await page.getByRole('link', { name: 'Transparence' }).first().click();
  await page.waitForURL('**/transparence**', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const alerte = await page.getByRole('alert').count();
  assert(alerte >= 1, 'erreur API : bloc d\'erreur (role=alert) affiché');
  await page.unroute('**/api/transparence/stats/**');
  const bouton = page.getByRole('button', { name: 'Réessayer' }).first();
  assert((await bouton.count()) >= 1, 'bouton « Réessayer » présent');
  if (await bouton.count()) {
    await bouton.click();
    await page.waitForTimeout(3000);
    const apres = await page.locator('#contenu-principal').innerText();
    const cartes = CARTES_CONSULTATIONS.filter((l) => apres.includes(l)).length;
    assert(cartes >= 4, `« Réessayer » : les cartes réapparaissent (${cartes}/4)`);
  }

  // b) Période sans données → message vide utile (pas de graphique vide)
  await page.goBack();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: 'Statistiques' }).first().click();
  await page.waitForURL('**/admin/statistiques**', { timeout: 15000 });
  await page.waitForSelector('#panneau-visiteurs', { timeout: 15000 });
  await page.locator('#panneau-visiteurs').getByRole('button', { name: 'Personnalisée' }).click();
  await page.waitForTimeout(400);
  await page.fill('#periode-debut', '2030-01-01');
  await page.fill('#periode-fin', '2030-01-02');
  await page.waitForTimeout(2000);
  const vide = await page.getByText('Pas encore de données pour cette période.').count();
  assert(vide >= 1, 'période sans données : message « Pas encore de données… »');

  // c) Débordement horizontal à 375 / 768 / 1280 px
  for (const [w, h] of [[375, 812], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(deborde <= 2, `${w}px : pas de débordement horizontal (${deborde}px)`);
    const tableDefile = await page.evaluate(() => {
      const t = document.querySelector('#panneau-visiteurs table, #stats-top-consultes table');
      if (!t) return true;
      let n = t.parentElement;
      while (n && getComputedStyle(n).overflowX !== 'auto') n = n.parentElement;
      return Boolean(n);
    });
    assert(tableDefile, `${w}px : tableau dans un conteneur défilable`);
  }
}

assert(erreursConsole.length === 0, `aucune erreur JS non interceptée (${erreursConsole.length})`);
if (erreursConsole.length) console.log('  →', erreursConsole.slice(0, 3).join(' ; '));

await ctx.close();
await browser.close();
console.log(failed === 0 ? '\nTOUT EST OK' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
