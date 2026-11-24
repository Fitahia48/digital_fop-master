import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const spec = readFileSync(new URL('../../strapi-backend/tests/mailer-e2e.test.cjs', import.meta.url), 'utf8');
const ADMIN_EMAIL = spec.match(/ADMIN_PANEL_EMAIL \|\| '([^']+)'/)?.[1];
const ADMIN_PASSWORD = spec.match(/ADMIN_PANEL_PASSWORD \|\| '([^']+)'/)?.[1];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));

await page.goto(`${BASE}/portail-gestion/connexion`, { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', ADMIN_EMAIL);
await page.fill('input[name="password"]', ADMIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**', { timeout: 25000 });

console.log('=== /transparence ===');
await page.goto(`${BASE}/transparence`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
console.log('URL:', page.url());
const txt = await page.locator('#contenu-principal').innerText();
console.log('TEXTE (400 premiers caractères):\n', txt.slice(0, 400).replace(/\n+/g, ' | '));
console.log('nb .grid>div dans main:', await page.locator('main .grid > div').count());
console.log('nb canvas:', await page.locator('main canvas').count());
console.log('nb Réessayer:', await page.getByRole('button', { name: 'Réessayer' }).count());
console.log('nb details:', await page.locator('details').count());

console.log('\n=== /admin/statistiques ===');
await page.goto(`${BASE}/admin/statistiques`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
console.log('URL:', page.url());
console.log('nb #panneau-visiteurs:', await page.locator('#panneau-visiteurs').count());
console.log('nb boutons période:', await page.locator('#panneau-visiteurs [role="group"] button').allTextContents());
console.log('nb canvas visiteurs:', await page.locator('#panneau-visiteurs canvas').count());
await page.getByRole('tab', { name: /Textes/ }).click();
await page.waitForTimeout(2500);
console.log('nb canvas textes:', await page.locator('#panneau-textes canvas').count());
await page.getByRole('tab', { name: /Corps/ }).click();
await page.waitForTimeout(2500);
console.log('nb canvas corps:', await page.locator('#panneau-corps canvas').count());
console.log('nb table corps-consultes:', await page.locator('#stats-corps-consultes table').count());

console.log('\n=== erreur simulée sur transparence ===');
await page.route('**/api/transparence/stats/**', (route) => route.abort());
await page.goto(`${BASE}/transparence`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
console.log('URL:', page.url());
console.log('nb alert:', await page.getByRole('alert').count());
console.log('nb Réessayer:', await page.getByRole('button', { name: 'Réessayer' }).count());
const t2 = await page.locator('#contenu-principal').innerText();
console.log('TEXTE (300):', t2.slice(0, 300).replace(/\n+/g, ' | '));

await browser.close();
