const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'src');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const staticKeys = new Set();
const prefixes = new Set();
const computed = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // t('a.b.c') / t("a.b.c") / i18n.t('a.b')
  const staticRe = /\bt\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g;
  let m;
  while ((m = staticRe.exec(src))) staticKeys.add(m[2]);
  // t(`prefix.${...}`) → préfixe dynamique
  const tplRe = /\bt\(\s*`([^`$]*)\$\{/g;
  while ((m = tplRe.exec(src))) prefixes.add(m[1]);
  // t(variable) → clé calculée, à signaler manuellement
  const varRe = /\bt\(\s*([A-Za-z_$][\w.$]*)\s*[,)]/g;
  while ((m = varRe.exec(src))) computed.push(`${path.relative(ROOT, f)} → t(${m[1]})`);
}

const locales = ['fr', 'en', 'mg'];
const data = {};
for (const l of locales) {
  data[l] = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', l, 'translation.json'), 'utf8'));
}

const isUsed = (key) => {
  if (staticKeys.has(key)) return true;
  for (const p of prefixes) if (p && key.startsWith(p)) return true;
  return false;
};

const orphans = [];
(function collect(obj, trail) {
  for (const [k, v] of Object.entries(obj)) {
    const key = trail ? `${trail}.${k}` : k;
    if (v && typeof v === 'object') collect(v, key);
    else if (!isUsed(key)) orphans.push(key);
  }
})(data.fr, '');

console.log('--- clés calculées (à vérifier à la main) ---');
console.log([...new Set(computed)].join('\n') || '(aucune)');
console.log('\n--- préfixes dynamiques détectés ---');
console.log([...prefixes].sort().join('\n') || '(aucun)');
console.log(`\n--- clés orphelines (locales identiques ?) ---`);
const frKeys = JSON.stringify(orphans.sort());
console.log(`total: ${orphans.length}`);
for (const l of locales) {
  const o = [];
  (function c(obj, trail) {
    for (const [k, v] of Object.entries(obj)) {
      const key = trail ? `${trail}.${k}` : k;
      if (v && typeof v === 'object') c(v, key);
      else if (!isUsed(key)) o.push(key);
    }
  })(data[l], '');
  console.log(l, o.length, JSON.stringify(o.sort()) === frKeys ? '(mêmes clés que fr)' : '(DIFFÈRE : ' + JSON.stringify(o.sort()) + ')');
}
console.log('\n--- liste fr ---');
console.log(orphans.sort().join('\n'));
