/**
 * Tests unitaires de l'identification anonyme du visiteur (Étape 8).
 *
 * Cible : dist/src/utils/{dates,visitor-id}.js (code COMPILÉ par `npm run build`)
 * — exécute :  npm run build && node tests/visitor-id.test.cjs
 *
 * Couvre :
 *  - bascule de jour à Madagascar 23h59 → 00h01 (UTC+3, pas l'UTC) ;
 *  - injection du jour pour test (VISITOR_JOUR_FIXE) + refus en production ;
 *  - normalisation IPv4/IPv6 (::ffff:, /64, port, zone) ;
 *  - empreinte HMAC : longueur, stabilité intra-jour, changement à minuit,
 *    absence d'IP en clair, sensibilité au secret ;
 *  - production sans secret → comptage refusé ;
 *  - détection des robots.
 */
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const dist = (m) => require(path.join(__dirname, '..', 'dist', 'src', 'utils', m));

// Secret de test : doit être défini AVANT la première lecture (cache).
process.env.VISITOR_HASH_SECRET = 'secret-de-test-0123456789abcdef';
delete process.env.VISITOR_JOUR_FIXE;

const { dateJourMadagascar, horodatageMadagascar } = dist('dates.js');
const visitor = dist('visitor-id.js');

let ok = 0;
const test = (nom, fn) => {
  try {
    fn();
    ok += 1;
    console.log(`  ✔ ${nom}`);
  } catch (err) {
    console.error(`  ✘ ${nom}\n    ${err.message}`);
    process.exitCode = 1;
  }
};

console.log('— Jour malgache (fuseau Indian/Antananarivo, UTC+3) —');
test('23:59 UTC = 02:59 lendemain ? NON : 20:59 UTC = 23:59 local → même jour', () => {
  assert.strictEqual(dateJourMadagascar(new Date('2026-10-21T20:59:00Z')), '2026-10-21');
});
test('21:01 UTC = 00:01 local (jour suivant) → bascule à minuit Madagascar', () => {
  assert.strictEqual(dateJourMadagascar(new Date('2026-10-21T21:01:00Z')), '2026-10-22');
});
test('00:00 local (21:00 UTC la veille) → premier jour', () => {
  assert.strictEqual(dateJourMadagascar(new Date('2026-10-21T21:00:00Z')), '2026-10-22');
});
test('heure UTC seule (02:00 UTC) = jour malgache encore identique', () => {
  assert.strictEqual(dateJourMadagascar(new Date('2026-10-21T02:00:00Z')), '2026-10-21');
});
test('horodatageMadagascar au format AAAA-MM-JJ HH:mm:ss', () => {
  assert.match(horodatageMadagascar(new Date('2026-10-21T10:00:00Z')), /^2026-10-21 13:00:00$/);
});

console.log('— Injection du jour (VISITOR_JOUR_FIXE) —');
test('jourCourant() = jour malgache courant par défaut', () => {
  assert.strictEqual(visitor.jourCourant(), dateJourMadagascar());
});
test('VISITOR_JOUR_FIXE est honoré hors production', () => {
  process.env.VISITOR_JOUR_FIXE = '2026-03-15';
  assert.strictEqual(visitor.jourCourant(), '2026-03-15');
  delete process.env.VISITOR_JOUR_FIXE;
});

console.log('— Normalisation des IP —');
test('IPv4-mappée IPv6 (::ffff:192.0.2.7) → IPv4', () => {
  assert.strictEqual(visitor.normaliserIp('::ffff:192.0.2.7'), '192.0.2.7');
});
test('IPv4-mappée hexadécimale (::ffff:7f00:1) → 127.0.0.1', () => {
  assert.strictEqual(visitor.normaliserIp('::ffff:7f00:1'), '127.0.0.1');
});
test('IPv4 porté (192.0.2.7:443) → 192.0.2.7', () => {
  assert.strictEqual(visitor.normaliserIp('192.0.2.7:443'), '192.0.2.7');
});
test('IPv6 /64 : 2001:db8:abcd:1234:5678:… → préfixe /64 conservé', () => {
  assert.strictEqual(
    visitor.normaliserIp('2001:db8:abcd:1234:5678:9abc:def0:1234'),
    '2001:db8:abcd:1234::/64'
  );
});
test('IPv6 compressée (2001:db8::1) : les hextets manquants sont PADS (pas tronqués)', () => {
  assert.strictEqual(visitor.normaliserIp('2001:db8::1'), '2001:db8:0:0::/64');
});
test('IPv6 locale (fe80::1%eth0) avec zone retirée', () => {
  assert.strictEqual(visitor.normaliserIp('fe80::1%eth0'), 'fe80:0:0:0::/64');
});
test('deux adresses de la même machine /64 → même préfixe (même visiteur)', () => {
  assert.strictEqual(
    visitor.normaliserIp('2001:db8:abcd:1234:aaa:1:2:3'),
    visitor.normaliserIp('2001:db8:abcd:1234:bbb:4:5:6')
  );
});
test("adresse vide ou '::' → inexploitable ('')", () => {
  assert.strictEqual(visitor.normaliserIp(''), '');
  assert.strictEqual(visitor.normaliserIp('::'), '');
});

console.log('— Empreinte HMAC —');
const h1 = visitor.visiteurHashDepuisIp('198.51.100.10', '2026-10-21');
test("empreinte sur32 caractères hexadécimaux", () => {
  assert.match(h1, /^[0-9a-f]{32}$/);
});
test('empreinte stable pour la même IP et le même jour (10 appels identiques)', () => {
  for (let i = 0; i < 10; i += 1) {
    assert.strictEqual(visitor.visiteurHashDepuisIp('198.51.100.10', '2026-10-21'), h1);
  }
});
test("l'empreinte ne contient JAMAIS l'IP en clair", () => {
  assert.ok(!h1.includes('198.51.100.10'));
  assert.ok(!h1.includes('198.51.100'));
  assert.ok(!h1.includes('100.10'));
});
test('changement de jour → autre empreinte (remise à zéro à minuit)', () => {
  const lendemain = visitor.visiteurHashDepuisIp('198.51.100.10', '2026-10-22');
  assert.notStrictEqual(lendemain, h1);
  assert.match(lendemain, /^[0-9a-f]{32}$/);
});
test('autre IP → autre empreinte', () => {
  assert.notStrictEqual(visitor.visiteurHashDepuisIp('198.51.100.11', '2026-10-21'), h1);
});
test('empreinte IPv6 /64 : deux adresses du même /64 → MÊME empreinte', () => {
  const a = visitor.visiteurHashDepuisIp('2001:db8:abcd:1234:1:2:3:4', '2026-10-21');
  const b = visitor.visiteurHashDepuisIp('2001:db8:abcd:1234:9:8:7:6', '2026-10-21');
  assert.strictEqual(a, b);
});
test('le secret change l’empreinte (HMAC, pas un simple hash)', () => {
  const avecAutreSecret = spawnSync(
    process.execPath,
    [
      '-e',
      `process.env.VISITOR_HASH_SECRET='autre-secret-differant-9876543210';
       const v = require(${JSON.stringify(
         path.join(__dirname, '..', 'dist', 'src', 'utils', 'visitor-id.js')
       )});
       process.stdout.write(v.visiteurHashDepuisIp('198.51.100.10', '2026-10-21') || 'null');`,
    ],
    { encoding: 'utf8' }
  ).stdout;
  assert.match(avecAutreSecret, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(avecAutreSecret, h1);
});

console.log('— Secret absent —');
test('PRODUCTION sans VISITOR_HASH_SECRET → comptage refusé (null, message clair)', () => {
  const res = spawnSync(
    process.execPath,
    [
      '-e',
      `process.env.NODE_ENV='production';
       delete process.env.VISITOR_HASH_SECRET; delete process.env.VISITOR_SECRET;
       const v = require(${JSON.stringify(
         path.join(__dirname, '..', 'dist', 'src', 'utils', 'visitor-id.js')
       )});
       console.log(JSON.stringify({ actif: v.comptageActif(), hash: v.visiteurHashDepuisIp('198.51.100.10','2026-10-21') }));`,
    ],
    { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } }
  );
  const sortie = `${res.stdout || ''}${res.stderr || ''}`;
  const lignes = (res.stdout || '').trim().split('\n');
  const etat = JSON.parse(lignes[lignes.length - 1]);
  assert.strictEqual(etat.actif, false);
  assert.strictEqual(etat.hash, null);
  assert.ok(
    sortie.includes('VISITOR_HASH_SECRET'),
    "message d'erreur explicite attendu en console"
  );
});
test('PRODUCTION : VISITOR_JOUR_FIXE est IGNORÉ par jourCourant (pas de passe-droit)', () => {
  const sortie = spawnSync(
    process.execPath,
    [
      '-e',
      `process.env.NODE_ENV='production'; process.env.VISITOR_JOUR_FIXE='2000-01-01';
       const v = require(${JSON.stringify(path.join(__dirname, '..', 'dist', 'src', 'utils', 'visitor-id.js'))});
       process.stdout.write(v.jourCourant());`,
    ],
    { encoding: 'utf8' }
  ).stdout;
  assert.ok(!sortie.includes('2000-01-01'), 'jour fixe ne doit pas s’appliquer en production');
  assert.match(sortie.trim(), /^\d{4}-\d{2}-\d{2}$/);
});

console.log('— Robots / santé —');
const ctx = (ua, pathReq = '/api/documents/') => ({ request: { headers: { 'user-agent': ua }, path: pathReq } });
test('curl, wget, bot, headless → robot (non compté)', () => {
  for (const ua of ['curl/8.21.0', 'Wget/1.21', 'Googlebot/2.1', 'MyCrawler bot', 'HeadlessChrome/120']) {
    assert.strictEqual(visitor.estRobot(ctx(ua)), true, ua);
  }
});
test('navigateur classique → non robot', () => {
  assert.strictEqual(
    visitor.estRobot(
      ctx('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36')
    ),
    false
  );
});
test('chemin de santé → exclu', () => {
  assert.strictEqual(visitor.estCheminSante('/health'), true);
  assert.strictEqual(visitor.estCheminSante('/api/visites/ping'), false);
});

console.log(`\n${ok} test(s) réussis${process.exitCode ? ' — DES ÉCHECS CI-DESSUS' : ''}.`);
