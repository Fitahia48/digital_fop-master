// Vérification du comportement des liens du pied de page (Aide/FAQ, À propos).
// Usage : node tests/footer-links-verify.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// Guide déjà vu : sinon l'overlay driver.js bloque tous les clics hors cible.
await page.addInitScript(() => localStorage.setItem('onboarding_completed', 'true'));

const log = (...a) => console.log(...a);
let echecs = 0;

// Toute exception JavaScript non rattrapée (ex. ReferenceError : variable non
// importée) est un échec : elle casse le clic pour l'utilisateur.
const erreursPage = [];
page.on('pageerror', (err) => erreursPage.push(String(err && err.message ? err.message : err)));
const verifier = (condition, message) => {
  log(`${condition ? 'OK  ' : 'ÉCHEC'} — ${message}`);
  if (!condition) echecs++;
};

/** Clique un lien du pied de page depuis le bas de la page courante. */
const cliquerDepuisLeBas = async (href) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const avant = await page.evaluate(() => Math.round(window.scrollY));
  await page.locator(`footer a[href="${href}"]`).first().click();
  await page.waitForTimeout(1200);
  return avant;
};

// --- Aide / FAQ -------------------------------------------------------------
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const avantAide = await cliquerDepuisLeBas('/aide');
log('  (accueil scrollY avant clic :', avantAide + ')');
verifier(new URL(page.url()).pathname === '/aide', `« Aide / FAQ » ouvre /aide (url = ${page.url()})`);
const scrollAide = await page.evaluate(() => Math.round(window.scrollY));
verifier(scrollAide === 0, `la page Aide s'ouvre en haut (scrollY = ${scrollAide})`);
const question = page.getByRole('button', { name: /Comment trouver un document \?/ }).first();
verifier(await question.isVisible(), 'la première question de la FAQ est visible sans défiler');
const boxQuestion = await question.boundingBox();
verifier(
  boxQuestion !== null && boxQuestion.y >= 0 && boxQuestion.y < 900,
  `la première question est dans la fenêtre (y = ${boxQuestion ? Math.round(boxQuestion.y) : 'n/a'})`
);

// Re-clic sur le lien alors qu'on est déjà sur /aide, après être descendu.
const avantReclic = await cliquerDepuisLeBas('/aide');
log('  (aide scrollY avant re-clic :', avantReclic + ')');
const scrollReclic = await page.evaluate(() => Math.round(window.scrollY));
verifier(scrollReclic === 0, `re-clic sur « Aide / FAQ » remonte en haut (scrollY = ${scrollReclic})`);

// --- À propos ---------------------------------------------------------------
const avantAPropos = await cliquerDepuisLeBas('/a-propos');
log('  (aide scrollY avant clic À propos :', avantAPropos + ')');
verifier(
  new URL(page.url()).pathname === '/a-propos',
  `« À propos » ouvre /a-propos (url = ${page.url()})`
);
await page.waitForTimeout(800);
const scrollAPropos = await page.evaluate(() => Math.round(window.scrollY));
verifier(scrollAPropos === 0, `la page À propos s'ouvre en haut (scrollY = ${scrollAPropos})`);

// --- Revoir le guide ------------------------------------------------------
await page.goto(BASE + '/aide', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
await page.locator('footer button', { hasText: /Revoir le guide/ }).first().click();
await page.waitForTimeout(1500);
verifier(new URL(page.url()).pathname === '/', `« Revoir le guide » ramène à l'accueil (url = ${page.url()})`);
// Note : une fois le guide lancé, driver.js fait défiler la page jusqu'à sa
// première cible (#global-search-input) — le scrollY n'est donc plus 0, c'est
// voulu. On vérifie ici la navigation et le démarrage du tour.
log('  (accueil scrollY après lancement du guide :', await page.evaluate(() => Math.round(window.scrollY)) + ')');
verifier(
  await page.locator('.driver-overlay').first().isVisible().catch(() => false),
  'pied de page : le guide (driver.js) se relance réellement'
);

// --- Barre de menu : « Revoir le guide » (bouton, et non lien) -------------
// Fermer le tour éventuellement ouvert par le clic précédent.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.goto(BASE + '/aide', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const boutonMenu = page.locator('nav button', { hasText: /^Revoir le guide$/ }).first();
verifier(await boutonMenu.count() > 0, 'le bouton « Revoir le guide » est présent dans la barre de menu');
const avantMenu = erreursPage.length;
await boutonMenu.click();
await page.waitForTimeout(1800);
verifier(new URL(page.url()).pathname === '/', `menu « Revoir le guide » ramène à l'accueil (url = ${page.url()})`);
const guideVisible = await page.locator('.driver-overlay').first().isVisible().catch(() => false);
verifier(guideVisible, 'le guide (driver.js) se relance réellement');
verifier(
  erreursPage.length === avantMenu,
  `aucune erreur JavaScript pendant le clic${erreursPage.length ? ` (${erreursPage.join(' | ')})` : ''}`
);

// --- Première visite : le guide se lance automatiquement (non régressé) ---
const contexteNeuf = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pageNeuve = await contexteNeuf.newPage();
await pageNeuve.goto(BASE + '/', { waitUntil: 'networkidle' });
await pageNeuve.waitForTimeout(2500);
verifier(
  await pageNeuve.locator('.driver-overlay').first().isVisible().catch(() => false),
  'première visite : le guide se lance automatiquement'
);
await contexteNeuf.close();

await browser.close();
log(echecs === 0 ? '\nTOUT EST OK' : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
