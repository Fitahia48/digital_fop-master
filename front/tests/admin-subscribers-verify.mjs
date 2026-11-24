import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Smoke test de la page admin « Abonnés » (/admin/abonnes).
 *
 * Parcours réel vérifié via le front Vite (BASE_URL, défaut http://localhost:5173) :
 *   1. anonyme  → /admin/abonnes redirige vers la connexion (ProtectedRoute)
 *   2. admin    → login par le formulaire, lien « Abonnés » du menu, clic,
 *                 puis titre, compteurs, tableau, aria-live, badges texte
 *   3. recherche sans résultat → état vide + bouton « Réinitialiser »
 *   4. aucun jeton (confirm_token / unsubscribe_token) dans le DOM
 *
 * Identifiants admin lus depuis strapi-backend/tests/mailer-e2e.test.cjs
 * (fichiers de test du dépôt) — JAMAIS affichés dans la sortie.
 */
const BASE = process.env.BASE_URL || 'http://localhost:5173';
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

// ─── 1. Anonyme : ProtectedRoute ─────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/abonnes`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  const path = new URL(page.url()).pathname;
  assert(path === '/portail-gestion/connexion', `anonyme /admin/abonnes → redirection connexion (${path})`);
  await ctx.close();
}

// ─── 2. Admin : login + rendu de la page ─────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/portail-gestion/connexion`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL('**/dashboard**', { timeout: 25000 });
    assert(true, 'login admin → /dashboard');
  } catch {
    assert(false, `login admin → /dashboard (URL : ${new URL(page.url()).pathname})`);
  }
  await page.waitForTimeout(1200);

  // Parcours réel : clic sur le lien du menu (visible admin seulement)
  const link = page.locator('nav a[href="/admin/abonnes"]');
  assert(await link.first().isVisible().catch(() => false), 'lien « Abonnés » visible dans le menu admin');
  await link.first().click({ timeout: 10000 });
  await page.waitForTimeout(3000); // /users/me + chargement liste

  const path = new URL(page.url()).pathname;
  assert(path === '/admin/abonnes', `clic menu → page atteinte (${path})`);

  const state = await page.evaluate(() => {
    const h1s = [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).filter(Boolean);
    const rows = document.querySelectorAll('tbody tr');
    const live = document.querySelector('#abonnes-resultats');
    const badges = [...document.querySelectorAll('tbody tr span')].map((s) => s.textContent.trim());
    const ths = [...document.querySelectorAll('th')].map((th) => th.getAttribute('scope'));
    const body = document.body.innerText;
    return {
      h1: h1s.find((t) => t.includes('Abonnés')) || '',
      rowCount: rows.length,
      live: live ? live.textContent.trim() : '',
      badgeSample: badges.slice(0, 4),
      thScopes: ths,
      tokensInDom: /confirm_token|unsubscribe_token/.test(body),
      hasExport: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Exporter en CSV')),
      // Les libellés sont en capitales via CSS (uppercase) → comparaison insensible à la casse
      hasCounters: /total/i.test(body) && /confirm/i.test(body) && /en attente/i.test(body),
    };
  });

  assert(state.h1 === 'Abonnés aux alertes', `titre page : « ${state.h1} »`);
  assert(state.hasCounters, 'compteurs Total / Confirmés / En attente affichés');
  assert(state.rowCount > 0, `tableau rempli : ${state.rowCount} ligne(s)`);
  assert(/abonné\(s\)/.test(state.live), `résultats annoncés (aria-live) : « ${state.live} »`);
  assert(state.thScopes.length === 5 && state.thScopes.every((s) => s === 'col'), 'th scope="col" sur les 5 colonnes');
  assert(
    state.badgeSample.length === 0 || state.badgeSample.some((b) => b === 'Confirmé' || b === 'En attente'),
    `pastilles de statut avec libellé texte (${JSON.stringify(state.badgeSample)})`
  );
  assert(state.hasExport, 'bouton « Exporter en CSV » présent');
  assert(!state.tokensInDom, 'aucun jeton affiché dans le DOM');

  // ─── 3. Recherche sans résultat → état vide ────────────────────────────────
  await page.fill('#abonnes-search', 'zzz-aucune-coincidence');
  await page.waitForTimeout(1500); // debounce 300 ms + requête
  const empty = await page.evaluate(() => ({
    empty: /Aucun abonné ne correspond/.test(document.body.innerText),
    reset: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Réinitialiser'),
  }));
  assert(empty.empty, 'recherche sans résultat → état vide');
  assert(empty.reset, 'bouton « Réinitialiser » présent dans l’état vide');

  // ─── 4. « Réinitialiser » ramène la liste ──────────────────────────────────
  await page.click('button:has-text("Réinitialiser")');
  await page.waitForTimeout(1500);
  const restored = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  assert(restored > 0, `« Réinitialiser » restaure la liste (${restored} ligne(s))`);

  // ─── 5. Export CSV : téléchargement réel du fichier ────────────────────────
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('button:has-text("Exporter en CSV")'),
  ]);
  const fname = download.suggestedFilename();
  assert(/^abonnes-\d{4}-\d{2}-\d{2}\.csv$/.test(fname), `export CSV téléchargé (${fname})`);

  // ─── 6. Suppression avec confirmation (parcours réel, abonné de test) ────
  // Abonné jetable créé via l'API admin (core create : AUCUN e-mail envoyé),
  // supprimé par l'interface, puis vérifié côté API. Données réelles intactes.
  const STRAPI = process.env.STRAPI_URL || 'http://localhost:1337';
  const login = await fetch(`${STRAPI}/api/v1/auth/jwt/create/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  }).then((r) => r.json());
  const token = login.access || login.jwt;
  assert(Boolean(token), 'login API admin pour préparer le test de suppression');
  const apiHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const countSubs = () =>
    fetch(`${STRAPI}/api/subscribers/admin/list`, { headers: apiHeaders })
      .then((r) => r.json())
      .then((j) => j.counters.total);
  const before = await countSubs();
  const tempMail = `test-smoke-delete-${Date.now()}@example.test`;
  const created = await fetch(`${STRAPI}/api/subscribers/`, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ data: { email: tempMail, is_confirmed: false, langue_preferee: 'fr' } }),
  });
  assert(created.status === 201, `abonné de test créé via API (HTTP ${created.status})`);

  await page.fill('#abonnes-search', tempMail);
  await page.waitForTimeout(1500); // debounce + requête
  const rowsAfterSearch = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
  assert(rowsAfterSearch === 1, `recherche de l'abonné de test : ${rowsAfterSearch} ligne`);

  await page.click('tbody tr button:has-text("Supprimer")');
  await page.waitForTimeout(500);
  const modal = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const btns = [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim());
    return {
      title: dialog.querySelector('h2')?.textContent.trim() || '',
      body: dialog.textContent,
      btns,
      focused: document.activeElement ? document.activeElement.textContent.trim() : '',
    };
  });
  assert(Boolean(modal), 'modale de confirmation ouverte');
  assert(modal.title === 'Supprimer cet abonné ?', `texte du titre (« ${modal.title} »)`);
  assert(/Il ne recevra plus d'alertes\./.test(modal.body), 'texte « Il ne recevra plus d’alertes. »');
  assert(modal.btns.includes('Annuler') && modal.btns.includes('Supprimer'), 'boutons Annuler / Supprimer');
  assert(modal.focused === 'Annuler', 'focus initial sur « Annuler »');

  // Annuler : rien n'est supprimé
  await page.click('[role="dialog"] button:has-text("Annuler")');
  await page.waitForTimeout(500);
  const afterCancel = await page.evaluate(() => ({
    dialog: Boolean(document.querySelector('[role="dialog"]')),
    rows: document.querySelectorAll('tbody tr').length,
  }));
  assert(!afterCancel.dialog && afterCancel.rows === 1, '« Annuler » ferme la modale sans supprimer');

  // Confirmer : suppression + état vide sur la recherche
  await page.click('tbody tr button:has-text("Supprimer")');
  await page.waitForTimeout(400);
  await page.click('[role="dialog"] button:has-text("Supprimer")');
  await page.waitForTimeout(2000); // DELETE + rechargement
  const afterDelete = await page.evaluate(() => ({
    dialog: Boolean(document.querySelector('[role="dialog"]')),
    empty: /Aucun abonné ne correspond/.test(document.body.innerText),
    live: document.querySelector('#abonnes-resultats')?.textContent.trim() || '',
  }));
  assert(!afterDelete.dialog, 'modale refermée après suppression');
  assert(afterDelete.empty, 'état vide après suppression de l’unique résultat');
  assert(/0 abonné\(s\)/.test(afterDelete.live), `résultats aria-live : « ${afterDelete.live} »`);

  const after = await countSubs();
  assert(after === before, `compte API de retour à la normale (${after} = ${before})`);

  // Filet de sécurité : si l'interface a échoué, on nettoie l'abonné jetable.
  const leftover = await fetch(
    `${STRAPI}/api/subscribers/admin/list?search=${encodeURIComponent(tempMail)}`,
    { headers: apiHeaders }
  ).then((r) => r.json());
  for (const row of leftover?.data || []) {
    await fetch(`${STRAPI}/api/subscribers/admin/${row.id}`, { method: 'DELETE', headers: apiHeaders });
  }

  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\nTOUT EST OK' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
