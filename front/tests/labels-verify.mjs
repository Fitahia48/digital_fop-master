import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// ── 1) Validité JSON + présence de la nouvelle clé dans les 3 langues ────────
for (const lang of ['fr', 'en', 'mg']) {
  const raw = readFileSync(new URL(`../src/locales/${lang}/translation.json`, import.meta.url), 'utf8');
  const json = JSON.parse(raw);
  const v = json.documents?.details;
  const old = json.documents?.consulter;
  console.log(`${v ? 'PASS' : 'FAIL'} — ${lang}: documents.details = ${JSON.stringify(v)} (ancienne clé présente : ${old !== undefined})`);
  if (!v || old !== undefined) process.exitCode = 1;
}

// ── 2) Navigateur : libellé + compteur SOUS les boutons, ligne par ligne ────
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  // Aperçu du build local : Strapi n'autorise que l'origine 5173 en CORS.
  args: process.env.NO_CORS === '1' ? ['--disable-web-security'] : [],
});
const assert = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} — ${m}`); if (!c) process.exitCode = 1; };

async function run(viewport, label) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}/AfficherDoc`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

    const res = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const rows = [...document.querySelectorAll('tr, li')].filter((row) =>
      [...row.querySelectorAll('a, button')].some((e) => vis(e) && e.textContent.trim() === 'Détails')
    ).slice(0, 8);
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
    const perRow = rows.map((row) => {
      const details = [...row.querySelectorAll('a, button')].find((e) => vis(e) && e.textContent.trim() === 'Détails');
      const telecharger = [...row.querySelectorAll('a, button')].find((e) => vis(e) && e.textContent.includes('Télécharger'));
      const counters = [...row.querySelectorAll('span')].filter((e) => vis(e) && e.className.includes('text-[11px]') && /\d/.test(e.textContent));
      const detailsRect = details ? r(details) : null;
      const telechargerRect = telecharger ? r(telecharger) : null;
      const countersRects = counters.map(r);

      return {
        hasDetails: Boolean(details),
        hasTelecharger: Boolean(telecharger),
        hasConsulter: [...row.querySelectorAll('a, button')].some((e) => e.textContent.trim() === 'Consulter'),
        countersCount: counters.length,
        detailsRect,
        telechargerRect,
        countersRects,
      };
    });
    return { rowCount: rows.length, perRow };
  });

  assert(res.rowCount >= 1, `${label}: ${res.rowCount} ligne(s) avec bouton « Détails »`);
  assert(res.perRow.every((x) => x.hasDetails), `${label}: chaque ligne a « Détails »`);
  assert(res.perRow.every((x) => !x.hasConsulter), `${label}: plus aucun bouton « Consulter »`);
  res.perRow.forEach((x, i) => {
    if (x.hasTelecharger) {
      const sameLine = Math.abs(x.detailsRect.top - x.telechargerRect.top) <= 6;
      assert(sameLine, `${label} ligne ${i + 1}: Détails et Télécharger sont côte à côte sur la même ligne (${x.detailsRect.top} vs ${x.telechargerRect.top})`);
    }
    x.countersRects.forEach((cRect) => {
      const okTop = cRect.top >= x.detailsRect.bottom;
      assert(okTop, `${label} ligne ${i + 1}: compteur SOUS les boutons (${cRect.top} >= ${x.detailsRect.bottom})`);
    });
  });
  await page.close();
}

await run({ width: 1280, height: 900 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');
await browser.close();
console.log(process.exitCode ? '\nÉCHEC' : '\nTOUT EST OK');
