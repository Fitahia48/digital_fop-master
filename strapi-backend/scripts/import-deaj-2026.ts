/**
 * Import des textes réels « TEXTES APPLI DEAJ 2026 » (dossier à la racine du
 * projet) dans la base Strapi, pour tests réels de l'application.
 *
 * Pour chaque PDF, les métadonnées sont extraites du nom de fichier :
 *   - type   : dossier parent (ARRETE → arrete, CIRCULAIRE → circulaire,
 *              DECRET → decret, LOI → loi_ordinaires, ORDONNANCES → ordonnance)
 *              — valeurs canoniques de la liste contrôlée (documentTypes.js) ;
 *   - numero : après « N° » (ex. 60-050, 14.576, 22021-08-MFPTLS) ;
 *   - date   : après « du 9 mars 1960 » / « du 18 11 2001 » (année sur 2
 *              chiffres ramenée au 20e siècle) — absente pour quelques textes
 *              anciens, laissée à null (aucune invention) ;
 *   - objet  : le reste du nom de fichier (intitulé officiel).
 *
 * Le PDF est uploadé via le service officiel `upload` (media « fichier »),
 * comme le fait le formulaire d'ajout admin. Les documents sont créés
 * « en_vigueur » et « validee » (visibles publiquement pour les tests).
 *
 * Idempotence : un (type, numero) — ou (type, objet) si pas de numéro — déjà
 * présent en base n'est pas réimporté.
 *
 * CLI :
 *   --dry-run (défaut) : affiche le rapport de parsing, n'écrit rien ;
 *   --apply            : upload les PDF et crée les 59 documents.
 *
 * Compilation (cf. p1-migrate.ts) :
 *   npx tsc scripts/import-deaj-2026.ts --outDir .tmp-scripts --module CommonJS \
 *     --moduleResolution Node --esModuleInterop --skipLibCheck
 *   node .tmp-scripts/import-deaj-2026.js [--apply]
 */
import fs from 'fs';
import path from 'path';

const APPLY = process.argv.includes('--apply');

// Instance Strapi cible — l'import passe par l'API HTTP (même circuit que le
// formulaire admin : multipart + service upload du serveur).
const BASE = process.env.STRAPI_URL || 'http://127.0.0.1:1337';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin.test@mtefop.mg';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestAdmin2026!';

// Le script compilé vit dans strapi-backend/.tmp-scripts/ → remonte à la racine.
const ROOT = path.resolve(__dirname, '..', '..', 'TEXTES APPLI DEAJ 2026');

/** Dossier source → type canonique (liste contrôlée, documentTypes.js). */
const TYPE_MAP: Record<string, string> = {
  ARRETE: 'arrete',
  CIRCULAIRE: 'circulaire',
  DECRET: 'decret',
  LOI: 'loi_ordinaires',
  ORDONNANCES: 'ordonnance',
};

const MOIS: Record<string, string> = {
  janv: '01', janvier: '01',
  fev: '02', fév: '02', fevrier: '02', février: '02',
  mars: '03',
  avril: '04', avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07', juil: '07',
  aout: '08', août: '08',
  septembre: '09', sept: '09',
  octobre: '10', oct: '10',
  novembre: '11', nov: '11',
  decembre: '12', déc: '12', dec: '12', décembre: '12',
};

type Parsed = { type: string; numero: string | null; date: string | null; objet: string; avis: string[] };

/** Extrait numéro / date / objet du nom de fichier (sans extension). */
function parseFileName(folder: string, fileName: string): Parsed {
  const avis: string[] = [];
  const base = fileName.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  // Numéro : après « N° » jusqu'au premier espace (ex. 60-050, 14.576…).
  const numMatch = base.match(/n[°ºo]\s*([0-9][0-9A-Za-z.\-]*)/i);
  const numero = numMatch ? numMatch[1] : null;
  if (!numero) avis.push('numéro introuvable dans le nom');

  // Date : « du 9 mars 1960 » / « du 18 11 2001 » / « DU 26 juillet 2005 ».
  // On prend la PREMIÈRE occurrence (les références citées dans l'objet
  // contiennent aussi « du … » — il ne faut pas les avaler).
  let date: string | null = null;
  const dateMatch = base.match(/\bdu\s+(\d{1,2})(?:er)?\s+([A-Za-zéûôèàç]+|\d{1,2})\s+(\d{2,4})\b/i);
  if (dateMatch) {
    const jour = dateMatch[1].padStart(2, '0');
    const moisBrut = dateMatch[2].toLowerCase();
    const mois = /^\d+$/.test(moisBrut) ? moisBrut.padStart(2, '0') : MOIS[moisBrut];
    let annee = parseInt(dateMatch[3], 10);
    if (dateMatch[3].length === 2) annee = annee < 50 ? 2000 + annee : 1900 + annee;
    if (mois && /^\d{2}$/.test(mois) && Number(mois) >= 1 && Number(mois) <= 12) {
      date = `${annee}-${mois}-${jour}`;
    }
  }
  if (!date) avis.push('date introuvable dans le nom');

  // Objet : le texte après la date (ou après le numéro si pas de date).
  let objet = base;
  if (dateMatch) objet = base.slice(base.indexOf(dateMatch[0]) + dateMatch[0].length);
  else if (numMatch) objet = base.slice(base.indexOf(numMatch[0]) + numMatch[0].length);
  objet = objet.replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, '');
  if (!objet) {
    objet = base; // repli : nom complet (jamais d'objet vide, champ requis)
    avis.push('objet vide → nom de fichier utilisé');
  }

  return { type: TYPE_MAP[folder] ?? 'note', numero, date, objet, avis };
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Dossier introuvable : ${ROOT}`);
    process.exit(1);
  }

  const jobs: { folder: string; fileName: string; fullPath: string; parsed: Parsed }[] = [];
  for (const folder of Object.keys(TYPE_MAP)) {
    const dir = path.join(ROOT, folder);
    if (!fs.existsSync(dir)) continue;
    for (const fileName of fs.readdirSync(dir)) {
      if (!/\.pdf$/i.test(fileName)) continue;
      jobs.push({ folder, fileName, fullPath: path.join(dir, fileName), parsed: parseFileName(folder, fileName) });
    }
  }
  console.log(`\n${jobs.length} PDF trouvés dans ${ROOT}\n`);

  // ─── Rapport de parsing (toujours affiché) ─────────────────────────────────
  for (const job of jobs) {
    const { type, numero, date, objet, avis } = job.parsed;
    const flag = avis.length ? ` ⚠️  ${avis.join(' ; ')}` : '';
    console.log(`[${type.padEnd(14)}] n°${(numero ?? '—').padEnd(16)} ${(date ?? '—').padEnd(11)} ${objet.slice(0, 60)}${flag}`);
  }
  const incomplets = jobs.filter((j) => j.parsed.avis.length > 0);
  console.log(`\n→ ${jobs.length - incomplets.length} fichier(s) entièrement parsés, ${incomplets.length} avec métadonnées manquantes (champs laissés vides, rien d'inventé).\n`);

  if (!APPLY) {
    console.log('Mode DRY-RUN : rien n\'a été écrit. Relancer avec --apply pour importer.');
    return;
  }

  // ─── Import via l'API HTTP (même circuit que le formulaire admin) ─────────
  const loginRes = await fetch(`${BASE}/api/v1/auth/jwt/create/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`Connexion admin impossible (HTTP ${loginRes.status}) — instance Strapi sur ${BASE} ?`);
    process.exit(1);
  }
  const { access } = (await loginRes.json()) as { access: string };
  const auth = { Authorization: `Bearer ${access}` };

  // Idempotence : (type, numero) déjà en base → sauté.
  const listeRes = await fetch(`${BASE}/api/documents/?page_size=100`, { headers: auth });
  const existants = ((await listeRes.json()) as { results?: any[] }).results ?? [];
  const clesNum = new Set(
    existants.map((d) => `${d.type}|${d.numero ?? ''}`.toLowerCase()).filter((k) => !k.endsWith('|'))
  );
  const clesObjet = new Set(existants.map((d) => `${d.type}|${String(d.objet ?? '').trim().toLowerCase()}`));

  let crees = 0;
  let sautees = 0;
  const rejets: string[] = [];

  for (const job of jobs) {
    const { type, numero, date, objet } = job.parsed;
    const cleNum = `${type}|${numero ?? ''}`.toLowerCase();
    const cleObj = `${type}|${objet.trim().toLowerCase()}`;
    if ((numero && clesNum.has(cleNum)) || clesObjet.has(cleObj)) {
      console.log(`  ⟂ sauté (déjà en base) : ${job.fileName}`);
      sautees++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(job.fullPath);
      const fd = new FormData();
      fd.append('type', type);
      fd.append('objet', objet);
      fd.append('numero', numero ?? '');
      fd.append('date', date ?? '');
      fd.append('langue', 'fr');
      fd.append('status', 'en_vigueur');
      fd.append('fichier', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), job.fileName);

      const res = await fetch(`${BASE}/api/documents/`, {
        method: 'POST',
        headers: auth,
        body: fd,
      });
      if (res.ok) {
        crees++;
        console.log(`  ✔ créé (${type}${numero ? ` n°${numero}` : ''}) : ${job.fileName}`);
      } else {
        const err = (await res.json().catch(() => ({}))) as any;
        const msg = err?.error?.message || err?.detail || `HTTP ${res.status}`;
        rejets.push(`${job.fileName} → ${msg}`);
        console.error(`  ✖ REJETÉ (HTTP ${res.status}) : ${job.fileName} → ${msg}`);
      }
    } catch (err) {
      rejets.push(`${job.fileName} → ${(err as Error).message}`);
      console.error(`  ✖ ÉCHEC : ${job.fileName} → ${(err as Error).message}`);
    }
  }

  console.log(`\n=== Import terminé : ${crees} créé(s), ${sautees} sauté(s), ${rejets.length} rejeté(s)/échec(s) ===`);
  if (incomplets.length) {
    console.log('\nDocuments à métadonnées incomplètes :');
    for (const j of incomplets) console.log(`  • ${j.folder}/${j.fileName} — ${j.parsed.avis.join('; ')}`);
  }
  if (rejets.length) {
    console.log('\nRejets / échecs (le serveur refuse ces créations — donnée réelle incomplète) :');
    for (const e of rejets) console.log(`  • ${e}`);
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
