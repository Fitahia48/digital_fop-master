import { chromium } from 'playwright';

/**
 * Vérification de la page « À propos » (/a-propos) — refonte visuelle.
 *
 *  1. Bandeau institutionnel : titre, sous-titre, dégagement sous le menu fixe.
 *  2. Sections de contenu (mission, présentation, anonymat) avec le texte du CMS.
 *  3. Aucune colonne latérale vide quand le CMS ne fournit ni cadre légal,
 *     ni contacts, ni liens utiles ; contenu centré.
 *  4. Appels à l'action : « Recherche » (/AfficherDoc) et « Aide / FAQ » (/aide).
 *  5. Mobile : pas de débordement horizontal, bandeau dans l'écran.
 *  6. Aucune erreur JavaScript ; en-tête et menu publics toujours présents.
 *
 * Ne modifie aucune donnée : lecture seule.
 */
const BASE = process.env.BASE_URL || 'http://localhost:5173';

let failed = 0;
const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!cond) failed += 1;
};

const etatPage = (page) =>
  page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
    };
    const nav = document.querySelector('nav');
    const hero = document.querySelector('main header');
    // Colonne de contenu = parent de la première section (le <div> centré).
    const contenu = document.querySelector('section[aria-labelledby="apropos-mission"]')?.parentElement;
    const cta = document.querySelector('section[aria-labelledby="apropos-explorer"]');
    const h1s = [...document.querySelectorAll('main h1')].map((h) => h.textContent.trim());
    const h2s = [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim());
    return {
      nav: nav ? rect(nav) : null,
      hero: hero ? rect(hero) : null,
      heroGradient: hero ? /bg-gradient-to-br/.test(hero.className) : false,
      heroText: hero ? hero.innerText.replace(/\s+/g, ' ').trim() : '',
      contenuWidth: contenu ? Math.round(contenu.getBoundingClientRect().width) : 0,
      h1s,
      h2s,
      sections: {
        mission: Boolean(document.querySelector('#apropos-mission')),
        presentation: Boolean(document.querySelector('#apropos-presentation')),
        anonymat: Boolean(document.querySelector('#apropos-anonymat')),
      },
      asides: document.querySelectorAll('aside').length,
      ctaRecherche: cta?.querySelector('a[href="/AfficherDoc"]')?.textContent.trim() || '',
      ctaAide: cta?.querySelector('a[href="/aide"]')?.textContent.trim() || '',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      texte: document.body.innerText.replace(/\s+/g, ' '),
    };
  });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ─── 1-4. Bureau ─────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const etat = await etatPage(page);

  assert(etat.h1s[0] === 'À propos', `titre principal (« ${etat.h1s[0]} »)`);
  assert(etat.heroGradient, 'bandeau institutionnel avec dégradé');
  assert(
    Boolean(etat.nav) && Boolean(etat.hero) && etat.hero.top >= etat.nav.bottom,
    `bandeau dégagé sous le menu (hero ${etat.hero?.top} ≥ nav ${etat.nav?.bottom})`
  );
  assert(
    /Institution, mission et cadre légal/.test(etat.heroText),
    'sous-titre institutionnel affiché'
  );
  assert(
    etat.sections.mission && etat.sections.presentation && etat.sections.anonymat,
    `sections mission / présentation / anonymat (${JSON.stringify(etat.sections)})`
  );
  assert(
    etat.h2s.includes('Notre Mission') &&
      etat.h2s.includes('Présentation') &&
      etat.h2s.some((titre) => /anonyme/i.test(titre)),
    `titres de section (${JSON.stringify(etat.h2s)})`
  );
  assert(
    /Politique du Gouvernement en matière de Travail/.test(etat.texte),
    'texte de mission issu du CMS rendu'
  );
  assert(
    /bibliothèque numérique donnant accès aux textes réglementaires/.test(etat.texte),
    'texte de présentation issu du CMS rendu'
  );
  assert(etat.asides === 0, `aucune colonne latérale vide (${etat.asides} aside)`);
  assert(
    etat.contenuWidth > 0 && etat.contenuWidth <= 800,
    `contenu centré et lisible (${etat.contenuWidth} px)`
  );
  assert(etat.ctaRecherche.includes('Recherche'), `appel à l'action « ${etat.ctaRecherche} »`);
  assert(etat.ctaAide.includes('Aide / FAQ'), `appel à l'action « ${etat.ctaAide} »`);
  assert(etat.overflow <= 0, `aucun débordement horizontal (${etat.overflow} px)`);
  assert(etat.nav !== null, 'en-tête et menu publics toujours présents');

  // Navigation réelle par les appels à l'action
  await page.click('main a[href="/AfficherDoc"]');
  await page.waitForTimeout(1200);
  assert(
    new URL(page.url()).pathname === '/AfficherDoc',
    `« Recherche » ouvre la recherche (${new URL(page.url()).pathname})`
  );
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('main a[href="/aide"]');
  await page.waitForTimeout(1000);
  assert(new URL(page.url()).pathname === '/aide', `« Aide / FAQ » ouvre l'aide (${new URL(page.url()).pathname})`);

  assert(erreurs.length === 0, `aucune erreur JavaScript (${erreurs.join(' | ') || '0'})`);
  await ctx.close();
}

// ─── 5. Mobile ───────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const etat = await etatPage(page);
  assert(etat.overflow <= 0, `mobile : aucun débordement horizontal (${etat.overflow} px)`);
  assert(
    Boolean(etat.hero) && etat.hero.width <= 390 && etat.hero.top >= (etat.nav?.bottom ?? 0),
    `mobile : bandeau dans l'écran et sous le menu (${etat.hero?.width} px)`
  );
  assert(
    await page.locator('main a[href="/AfficherDoc"]').isVisible(),
    'mobile : appel à l’action « Recherche » visible'
  );
  await ctx.close();
}

// ─── 6. Branche « colonne latérale » (réponse API simulée) ──────────────────
// Le CMS local ne contient ni cadre légal, ni contacts, ni liens utiles : on
// simule une réponse complète pour vérifier la mise en page 3 colonnes et les
// liens générés (document validé, tel:, mailto:, lien externe).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/api/a-propos**', (route) => {
    const url = new URL(route.request().url());
    const locale = url.searchParams.get('locale') || 'fr';
    const contenu = {
      titre: locale === 'fr' ? 'À propos' : 'About',
      mission: '<p>Mission simulée pour la vérification.</p>',
      presentation_application: '<p>Présentation simulée.</p>',
      contact_email: 'contact@mtefop.mg',
      contact_telephone: '+261 20 22 650 10',
      contact_adresse: 'Antananarivo, Madagascar',
      document_legal: {
        id: 12,
        documentId: 'doc-legal-test',
        type: 'Décret',
        numero: '2024-055',
        objet: 'Objet du décret simulé',
      },
      liens_utiles: [{ libelle: 'Site du ministère', url: 'https://www.mtefpls.gov.mg' }],
    };
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: contenu }),
    });
  });

  await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);

  const cote = await page.evaluate(() => {
    const grille = document.querySelector('main header')?.nextElementSibling;
    const aside = document.querySelector('aside');
    const lienDoc = aside?.querySelector('a[href="/documents/doc-legal-test"]');
    return {
      asides: document.querySelectorAll('aside').length,
      colonnes: grille ? getComputedStyle(grille).gridTemplateColumns.split(' ').length : 0,
      aCadreLegal: Boolean(document.querySelector('#apropos-cadre-legal')),
      aContacts: Boolean(document.querySelector('#apropos-contacts')),
      aLiens: Boolean(document.querySelector('#apropos-liens-utiles')),
      lienDoc: Boolean(lienDoc),
      tel: aside?.querySelector('a[href^="tel:"]')?.getAttribute('href') || '',
      mailto: aside?.querySelector('a[href^="mailto:"]')?.getAttribute('href') || '',
      externeRel: aside?.querySelector('a[target="_blank"]')?.getAttribute('rel') || '',
    };
  });

  assert(cote.asides === 1, `données complètes : colonne latérale rendue (${cote.asides} aside)`);
  assert(cote.colonnes === 3, `mise en page 3 colonnes (${cote.colonnes})`);
  assert(
    cote.aCadreLegal && cote.aContacts && cote.aLiens,
    `blocs cadre légal / contacts / liens (${JSON.stringify([cote.aCadreLegal, cote.aContacts, cote.aLiens])})`
  );
  assert(cote.lienDoc, 'document validé : lien vers /documents/doc-legal-test');
  assert(cote.tel === 'tel:+261202265010', `téléphone cliquable (${cote.tel})`);
  assert(cote.mailto === 'mailto:contact@mtefop.mg', `e-mail cliquable (${cote.mailto})`);
  assert(cote.externeRel === 'noopener noreferrer', `lien externe sécurisé (rel=${cote.externeRel})`);

  await ctx.close();
}

await browser.close();
console.log(failed === 0 ? '\nTOUT EST OK' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
