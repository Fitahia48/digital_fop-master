import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Vérification de la page de connexion (/portail-gestion/connexion).
 *
 *  1. Page autonome : ni en-tête, ni menu, ni pied de page, ni assistant.
 *  2. Formulaire : titre, libellés visibles, champs nommés, bascule du mot de passe.
 *  3. Pas de débordement horizontal (bureau 1440 px et mobile 390 px).
 *  4. La connexion fonctionne toujours (admin → /dashboard), et l'en-tête +
 *     le menu réapparaissent sur les autres pages.
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

let failed = 0;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!cond) failed += 1;
};

const etatPage = (page) =>
  page.evaluate(() => {
    const carte = document.querySelector('form')?.closest('div[class*="rounded-2xl"]');
    const rect = carte?.getBoundingClientRect();
    return {
      navs: document.querySelectorAll('nav').length,
      footers: document.querySelectorAll('footer').length,
      skipLink: document.querySelectorAll('a[href="#contenu-principal"]').length,
      chat: document.querySelectorAll('[aria-label*="assistant" i], [aria-label*="chat" i]').length,
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      labels: [...document.querySelectorAll('label')].map((l) => l.textContent.trim()),
      carte: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width) } : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      bodyMarginTop: getComputedStyle(document.body).marginTop,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ─── 1-3. Bureau : page autonome + formulaire ───────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  await page.goto(`${BASE}/portail-gestion/connexion`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const etat = await etatPage(page);

  assert(etat.navs === 0, `aucune barre de menu au-dessus du formulaire (${etat.navs} nav)`);
  assert(etat.skipLink === 0, 'aucun en-tête institutionnel (lien d’évitement absent)');
  assert(etat.footers === 0, `aucun pied de page (${etat.footers} footer)`);
  assert(etat.chat === 0, 'aucun assistant flottant sur la connexion');
  assert(etat.h1.includes('Se connecter'), `titre de la page (« ${etat.h1.join(' | ')} »)`);
  assert(
    etat.labels.includes('Email') && etat.labels.includes('Mot de passe'),
    `libellés de champs visibles (${JSON.stringify(etat.labels)})`
  );
  assert(etat.overflow <= 0, `aucun débordement horizontal (${etat.overflow} px)`);
  assert(
    Boolean(etat.carte) && etat.carte.top > 0 && etat.carte.bottom <= etat.viewport.h,
    `carte entièrement visible (${JSON.stringify(etat.carte)})`
  );
  assert(
    Boolean(etat.carte) &&
      Math.abs((etat.carte.top + etat.carte.bottom) / 2 - etat.viewport.h / 2) <= 2,
    'carte centrée verticalement (marge d’en-tête retirée)'
  );
  assert(
    etat.scrollHeight <= etat.viewport.h + 1,
    `pas de défilement inutile (${etat.scrollHeight} ≤ ${etat.viewport.h})`
  );
  assert(etat.bodyMarginTop === '0px', `marge d’en-tête retirée (body margin ${etat.bodyMarginTop})`);

  // Bascule afficher/masquer le mot de passe
  const champMdp = page.locator('input[name="password"]');
  assert((await champMdp.getAttribute('type')) === 'password', 'mot de passe masqué par défaut');
  const bascule = page.locator('button[aria-label="Afficher le mot de passe"]');
  assert((await bascule.count()) === 1, 'bouton « Afficher le mot de passe » présent');
  await bascule.click();
  assert((await champMdp.getAttribute('type')) === 'text', 'le clic révèle le mot de passe');
  assert(
    (await page.locator('button[aria-label="Masquer le mot de passe"]').getAttribute('aria-pressed')) === 'true',
    'état aria-pressed mis à jour'
  );
  await page.locator('button[aria-label="Masquer le mot de passe"]').click();
  assert((await champMdp.getAttribute('type')) === 'password', 'second clic masque à nouveau');

  // ─── 4. La connexion fonctionne toujours ─────────────────────────────────
  await page.fill('input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL('**/dashboard**', { timeout: 25000 });
    assert(true, 'connexion admin → /dashboard');
  } catch {
    assert(false, `connexion admin → /dashboard (URL : ${new URL(page.url()).pathname})`);
  }
  await page.waitForTimeout(1200);
  const apres = await etatPage(page);
  assert(apres.navs > 0, 'menu réapparu après connexion (hors page de connexion)');
  assert(apres.skipLink === 1, 'en-tête réapparu après connexion');
  assert(apres.bodyMarginTop === '160px', `marge d’en-tête rétablie ailleurs (${apres.bodyMarginTop})`);
  assert(erreurs.length === 0, `aucune erreur JavaScript sur la page de connexion (${erreurs.join(' | ') || '0'})`);

  await ctx.close();
}

// ─── 5. Mobile : pas de débordement, formulaire utilisable ─────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/portail-gestion/connexion`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const etat = await etatPage(page);
  assert(etat.navs === 0 && etat.skipLink === 0, 'mobile : page de connexion toujours autonome');
  assert(etat.overflow <= 0, `mobile : aucun débordement horizontal (${etat.overflow} px)`);
  assert(
    Boolean(etat.carte) && etat.carte.width <= etat.viewport.w,
    `mobile : carte dans la largeur de l’écran (${etat.carte?.width} ≤ ${etat.viewport.w})`
  );
  assert(await page.locator('input[name="email"]').isVisible(), 'mobile : champ email visible');
  assert(await page.locator('input[name="password"]').isVisible(), 'mobile : champ mot de passe visible');
  assert(await page.locator('button[type="submit"]').isVisible(), 'mobile : bouton de connexion visible');
  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\nTOUT EST OK' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
