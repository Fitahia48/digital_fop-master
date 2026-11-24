import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  // Aperçu du build local : Strapi n'autorise que l'origine 5173 en CORS.
  args: process.env.NO_CORS === '1' ? ['--disable-web-security'] : [],
});
const log = (...a) => console.log(...a);
let failed = 0;
const assert = (cond, msg) => {
  log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!cond) failed++;
};

async function run(viewport, label) {
  const page = await browser.newPage({ viewport });
  log(`\n===== ${label} =====`);
  await page.goto(`${BASE}/AfficherDoc`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Scrolle la liste pour reproduire l'usage réel, puis clique sur « Détails »
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(500);
  const cons = page.locator('a:visible, button:visible', { hasText: /^Détails$/ }).first();
  await cons.scrollIntoViewIfNeeded();
  const listScroll = await page.evaluate(() => window.scrollY);
  await cons.click();
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => {
    const nav = document.querySelector('nav.fixed') || document.querySelector('header');
    const back = [...document.querySelectorAll('button, a')].find((e) => e.textContent.trim().startsWith('Retour aux'));
    const fermer = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Fermer');
    const rawKey = document.body.innerText.includes('common.retour');
    const title = document.querySelector('h1#fiche-titre');
    const cs = back ? getComputedStyle(back) : null;
    const b = back?.getBoundingClientRect();
    const nb = nav?.getBoundingClientRect();
    const t = title?.getBoundingClientRect();
    return {
      path: location.pathname,
      listScrollY: null,
      scrollY: Math.round(window.scrollY),
      backFound: Boolean(back),
      backTop: b ? Math.round(b.top) : null,
      backInViewport: b ? b.top >= (nb?.bottom ?? 0) && b.bottom <= window.innerHeight : null,
      backStyle: cs ? `${cs.backgroundColor} / ${cs.color} / ${cs.fontSize} / ${cs.fontWeight}` : null,
      fermerFound: Boolean(fermer),
      fermerInViewport: fermer ? fermer.getBoundingClientRect().bottom <= window.innerHeight : null,
      titleTop: t ? Math.round(t.top) : null,
      titleBelowHeader: t ? t.top >= (nb?.bottom ?? 0) : null,
      rawKey,
    };
  });
  state.listScrollY = listScroll;

  assert(state.path.startsWith('/documents/'), `${label}: clic « Détails » → fiche (${state.path})`);
  assert(state.listScrollY > 0, `${label}: liste défilée avant le clic (scrollY=${state.listScrollY})`);
  assert(state.scrollY === 0, `${label}: fiche affichée depuis le haut (scrollY=${state.scrollY})`);
  assert(state.titleBelowHeader, `${label}: titre visible sous l'en-tête fixe (titleTop=${state.titleTop})`);
  assert(state.backFound && state.backInViewport, `${label}: « Retour aux résultats » visible à l'écran (top=${state.backTop})`);
  assert(state.backStyle?.startsWith('rgb(255, 255, 255)'), `${label}: bouton retour bien contrasté (${state.backStyle})`);
  assert(state.fermerFound, `${label}: bouton « Fermer » présent (plus de clé brute common.retour)`);
  assert(!state.rawKey, `${label}: aucune clé de traduction brute affichée`);

  // « Fermer » ramène à la liste des résultats
  const fermer = page.locator('button:visible', { hasText: 'Fermer' }).first();
  await fermer.scrollIntoViewIfNeeded();
  await fermer.click();
  await page.waitForTimeout(1500);
  const backPath = new URL(page.url()).pathname;
  assert(backPath === '/AfficherDoc', `${label}: « Fermer » revient à la liste (${backPath})`);

  await page.close();
}

await run({ width: 1280, height: 900 }, 'desktop 1280x900');
await run({ width: 390, height: 844 }, 'mobile 390x844');

await browser.close();
log(failed === 0 ? '\nTOUT EST OK' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
