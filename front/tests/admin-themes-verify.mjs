import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Smoke test de la page admin « Thèmes » (/admin/themes).
 *
 * Parcours réel via le front Vite (BASE_URL, défaut http://localhost:5173) :
 *   1. anonyme  → /admin/themes redirige vers la connexion (ProtectedRoute)
 *   2. admin    → login, lien « Thèmes » du menu (admin seulement), titre, aria-live
 *   3. création via le formulaire → ligne ajoutée (0 document) + toast
 *   4. doublon (casse différente) → erreur affichée, aucune ligne de plus
 *   5. renommage en ligne → nom mis à jour côté interface ET côté API
 *   6. suppression : modale, « Annuler » ne supprime rien, confirmation supprime
 *   7. thème rattaché à un document → avertissement + « Supprimer et détacher » :
 *      le thème part, le document reste (domaine null)
 *
 * Identifiants admin lus depuis strapi-backend/tests/mailer-e2e.test.cjs
 * (fichiers de test du dépôt) — JAMAIS affichés dans la sortie.
 * Données de test préfixées « ZZ » et nettoyées à la fin.
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

const stamp = Date.now();
const NOM = `ZZ Thème test ${stamp}`;
const NOM_RENOMME = `ZZ Thème renommé ${stamp}`;

let failed = 0;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!cond) failed += 1;
};

// ─── API : login + helpers de préparation/nettoyage ─────────────────────────
const login = await fetch(`${STRAPI}/api/v1/auth/jwt/create/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
}).then((r) => r.json());
const token = login.access || login.jwt;
if (!token) {
  console.error('FAIL — login API admin impossible');
  process.exit(1);
}
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const api = (path, opts = {}) => fetch(`${STRAPI}${path}`, { headers: H, ...opts });
const lireThemes = () => api('/api/domaines/?with_counts=true').then((r) => r.json());
const trouver = async (nom) => (await lireThemes()).results.find((r) => r.nom === nom);

/** Détache/supprime tout ce que le test a pu laisser, puis supprime les documents ZZ. */
const nettoyer = async () => {
  const { results } = await lireThemes();
  for (const theme of results.filter((t) => String(t.nom || '').startsWith('ZZ '))) {
    await api(`/api/domaines/${theme.documentId}?force=true`, { method: 'DELETE' });
  }
  const docs = await api('/api/documents?limit=100').then((r) => r.json()).catch(() => ({ results: [] }));
  for (const doc of docs.results || []) {
    if (String(doc.objet || '').startsWith('ZZ ')) {
      await api(`/api/documents/${doc.documentId}`, { method: 'DELETE' });
    }
  }
};

await nettoyer();
const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ─── 1. Anonyme : ProtectedRoute ─────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/themes`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const path = new URL(page.url()).pathname;
  assert(path === '/portail-gestion/connexion', `anonyme /admin/themes → redirection connexion (${path})`);
  await ctx.close();
}

// ─── 2. Admin : login, menu, page ────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

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

  const lien = page.locator('nav a[href="/admin/themes"]');
  assert(await lien.first().isVisible().catch(() => false), 'lien « Thèmes » visible dans le menu admin');
  await lien.first().click({ timeout: 10000 });
  await page.waitForTimeout(2500); // /users/me + chargement de la liste

  assert(new URL(page.url()).pathname === '/admin/themes', 'clic menu → /admin/themes');
  const entete = await page.evaluate(() => ({
    h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).filter(Boolean),
    live: document.querySelector('#themes-resultats')?.textContent.trim() || '',
    champ: Boolean(document.querySelector('#theme-nom')),
    aide: Boolean(document.querySelector('#theme-nom-aide')),
  }));
  assert(
    entete.h1s.includes('Gestion des thèmes'),
    `titre de page (« ${entete.h1s.join(' | ')} »)`
  );
  assert(/thème/.test(entete.live), `compteur aria-live (« ${entete.live} »)`);
  assert(entete.champ && entete.aide, 'formulaire de création (champ nom + aide) présent');

  // ─── 3. Création ───────────────────────────────────────────────────────────
  await page.fill('#theme-nom', `  ${NOM}  `);
  await page.click('button[type="submit"]:has-text("Ajouter")');
  await page.waitForTimeout(2000);

  const cree = await trouver(NOM);
  assert(Boolean(cree), 'thème créé côté API (nom normalisé)');
  assert(cree?.documents_count === 0, `documents_count = 0 (${cree?.documents_count})`);
  // La ligne est ciblée par son id : en mode renommage, le nom passe dans un
  // <input> et n'est plus dans le texte de la ligne (donc plus trouvable par texte).
  const ligneCreee = page.locator(`tbody tr[data-theme-id="${cree?.id}"]`);
  assert((await ligneCreee.count()) === 1, 'ligne ajoutée dans le tableau');
  assert(
    (await page.locator('.Toastify__toast', { hasText: 'Thème ajouté' }).count()) > 0,
    'toast de confirmation « Thème ajouté »'
  );
  assert((await page.inputValue('#theme-nom')) === '', 'champ de création vidé après succès');
  const optionsMenu = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('nav select[name="domaine"] option')].map((o) => o.textContent.trim())
    );
  assert(
    (await optionsMenu()).includes(NOM),
    'menu « Accès par thème » mis à jour sans rechargement'
  );

  // ─── 4. Doublon (casse différente) ─────────────────────────────────────────
  const avantDoublon = await page.locator('tbody tr').count();
  await page.fill('#theme-nom', NOM.toLowerCase());
  await page.click('button[type="submit"]:has-text("Ajouter")');
  await page.waitForTimeout(2000);
  assert(
    (await page.locator('.Toastify__toast', { hasText: 'existe déjà' }).count()) > 0,
    'doublon insensible à la casse → message d’erreur'
  );
  assert(
    (await page.locator('tbody tr').count()) === avantDoublon,
    'doublon refusé : aucune ligne ajoutée'
  );

  // ─── 5. Renommage en ligne ─────────────────────────────────────────────────
  const ligne = page.locator(`tbody tr[data-theme-id="${cree?.id}"]`);
  await ligne.locator('button:has-text("Renommer")').click();
  await page.waitForTimeout(300);
  const champEdition = ligne.locator('input[data-theme-edit]');
  assert((await champEdition.count()) === 1, 'champ de renommage ouvert dans la ligne');
  assert(
    await champEdition.evaluate((el) => document.activeElement === el).catch(() => false),
    'focus placé dans le champ de renommage'
  );
  await champEdition.fill(NOM_RENOMME);
  await ligne.locator('button:has-text("Enregistrer")').click();
  await page.waitForTimeout(2000);

  assert(Boolean(await trouver(NOM_RENOMME)), 'renommage enregistré côté API');
  assert(!(await trouver(NOM)), 'ancien nom absent côté API');
  assert(
    (await ligne.textContent()).includes(NOM_RENOMME),
    'tableau affiche le nouveau nom'
  );
  const optionsApresRenommage = await optionsMenu();
  assert(
    optionsApresRenommage.includes(NOM_RENOMME) && !optionsApresRenommage.includes(NOM),
    'menu « Accès par thème » affiche le nouveau nom'
  );

  // ─── 6. Suppression : annulation puis confirmation ─────────────────────────
  const ligneRenommee = page.locator(`tbody tr[data-theme-id="${cree?.id}"]`);
  await ligneRenommee.locator('button:has-text("Supprimer")').click();
  await page.waitForTimeout(400);
  const modale = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    return {
      titre: dialog.querySelector('h2')?.textContent.trim() || '',
      boutons: [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim()),
      focus: document.activeElement?.textContent.trim() || '',
    };
  });
  assert(Boolean(modale), 'modale de confirmation ouverte');
  assert(modale?.titre === 'Supprimer ce thème ?', `titre de la modale (« ${modale?.titre} »)`);
  assert(modale?.boutons.includes('Annuler') && modale?.boutons.includes('Supprimer'), 'boutons Annuler / Supprimer');
  assert(modale?.focus === 'Annuler', 'focus initial sur « Annuler »');

  await page.click('[role="dialog"] button:has-text("Annuler")');
  await page.waitForTimeout(500);
  assert((await page.locator('[role="dialog"]').count()) === 0, '« Annuler » ferme la modale');
  assert(Boolean(await trouver(NOM_RENOMME)), '« Annuler » ne supprime pas le thème');

  await ligneRenommee.locator('button:has-text("Supprimer")').click();
  await page.waitForTimeout(400);
  await page.click('[role="dialog"] button:text-is("Supprimer")');
  await page.waitForTimeout(2000);
  assert(!(await trouver(NOM_RENOMME)), 'confirmation → thème supprimé côté API');
  assert(
    !(await optionsMenu()).includes(NOM_RENOMME),
    'thème retiré du menu « Accès par thème »'
  );
  assert((await page.locator(`tbody tr[data-theme-id="${cree?.id}"]`).count()) === 0, 'ligne retirée du tableau');

  // ─── 7. Thème rattaché à un document → détachement explicite ───────────────
  const themeDoc = `ZZ Thème avec document ${stamp}`;
  const creatTheme = await api('/api/domaines/', {
    method: 'POST',
    body: JSON.stringify({ nom: themeDoc }),
  }).then((r) => r.json());
  const creatDoc = await api('/api/documents', {
    method: 'POST',
    body: JSON.stringify({
      type: 'Test temporaire',
      objet: `ZZ document du thème ${stamp}`,
      numero: `ZZ-${stamp}`,
      date: '2026-01-01',
      domaine: creatTheme.id,
    }),
  }).then((r) => r.json());
  assert(Boolean(creatTheme?.documentId && creatDoc?.documentId), 'thème + document de test créés via API');

  // Rechargement de la liste SANS rechargement dur : sur un F5, l'app repart
  // avec un contexte vide et ProtectedRoute renvoie vers la connexion puis le
  // dashboard (comportement préexistant de toutes les pages protégées).
  await page.click('nav a[href="/admin/abonnes"]');
  await page.waitForTimeout(1500);
  await page.click('nav a[href="/admin/themes"]');
  await page.waitForTimeout(3000);
  const ligneAvecDoc = page.locator(`tbody tr[data-theme-id="${creatTheme.id}"]`);
  assert((await ligneAvecDoc.count()) === 1, 'thème rattaché visible dans le tableau');
  assert(
    (await ligneAvecDoc.textContent()).includes('1 document'),
    'compteur de documents affiché dans la ligne'
  );

  await ligneAvecDoc.locator('button:has-text("Supprimer")').click();
  await page.waitForTimeout(400);
  const avertissement = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    return {
      texte: dialog.textContent,
      boutons: [...dialog.querySelectorAll('button')].map((b) => b.textContent.trim()),
    };
  });
  assert(
    /1 document\(s\) y sont rattachés/.test(avertissement?.texte || ''),
    'avertissement : documents rattachés'
  );
  assert(
    avertissement?.boutons.includes('Supprimer et détacher'),
    'bouton « Supprimer et détacher » proposé'
  );

  await page.click('[role="dialog"] button:has-text("Supprimer et détacher")');
  await page.waitForTimeout(2000);
  assert(!(await trouver(themeDoc)), 'thème supprimé malgré les documents');

  const docApres = await api(`/api/documents/${creatDoc.documentId}`).then((r) => r.json());
  assert(docApres?.domaine_nom === null, 'document conservé et détaché (domaine null)');
  assert(docApres?.objet === `ZZ document du thème ${stamp}`, 'contenu du document intact');

  assert(erreurs.length === 0, `aucune erreur JavaScript (${erreurs.join(' | ') || '0'})`);

  await ctx.close();
}

// ─── Nettoyage + contrôle final ─────────────────────────────────────────────
await nettoyer();
const restants = (await lireThemes()).results.filter((t) => String(t.nom || '').startsWith('ZZ '));
assert(restants.length === 0, `aucune donnée de test restante (${JSON.stringify(restants.map((r) => r.nom))})`);

await browser.close();
console.log(failed === 0 ? '\nTOUT EST OK' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
