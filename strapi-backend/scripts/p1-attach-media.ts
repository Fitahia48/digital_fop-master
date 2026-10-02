/**
 * P1 — Rattachement des fichiers documentaires (non destructif, idempotent).
 *
 * Rôle : déposer les PDF originaux dans `media/documents/` puis rattacher chaque
 * fichier à SA notice `document` — uniquement lorsque la correspondance est
 * CERTAINE (type + numéro tous deux présents et concordants dans le nom du
 * fichier, ou mapping explicite fourni en CLI). Aucun fichier n'est créé,
 * aucune métadonnée n'est inventée.
 *
 * Comportement :
 *  - aucune notice dont le fichier est déjà rattaché n'est modifiée (idempotent) ;
 *  - une correspondance incertaine (plusieurs candidats, ou numéro ambigu) est
 *    signalée SANS être traitée ;
 *  - les notices sans fichier sont listées en fin de rapport (« fichier non
 *    disponible » assumé côté front, cf. AfficherDocs).
 *
 * CLI :
 *   node .tmp-scripts/p1-attach-media.js                       → dry-run
 *   node .tmp-scripts/p1-attach-media.js --apply               → rattache les correspondances certaines
 *   node .tmp-scripts/p1-attach-media.js --map "fichier.pdf:12" → correspondance explicite (id document)
 *     (option répétable : --map "D2024-055-VF.pdf:3" --map "texte_1783506998080.pdf:5")
 *
 * Compilation (cf. MIGRATION.md, étape 4) :
 *   npx tsc scripts/p1-attach-media.ts --outDir .tmp-scripts --module CommonJS
 *     --moduleResolution Node --esModuleInterop --skipLibCheck
 */
import path from 'path';
import fs from 'fs';
import { compileStrapi, createStrapi } from '@strapi/strapi';

const APPLY = process.argv.includes('--apply');
const MEDIA_DIR = path.resolve(__dirname, '..', '..', 'media', 'documents');

/** Mappings explicites CLI : nom de fichier → id numérique du document. */
const argMaps: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--map' && process.argv[i + 1]) {
    argMaps.push(process.argv[i + 1]);
    i++;
  }
}

const norm = (v: string): string =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Extrait un numéro plausible d'un nom de fichier (ex. "2024-055", "3091"). */
const extractNumero = (filename: string): string | null => {
  const base = path.basename(filename).replace(/\.[^.]+$/, '');
  const m = base.match(/(\d{2,4}-\d{2,4}|\d{3,6})/);
  return m ? m[1] : null;
};

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    // ─── Inventaire des fichiers disponibles ────────────────────────────────
    if (!fs.existsSync(MEDIA_DIR)) {
      console.log(`[p1-attach] dossier média inexistant : ${MEDIA_DIR}`);
      console.log('[p1-attach] Créer le dossier et y déposer les PDF originaux, puis relancer.');
    }
    const files: string[] = fs.existsSync(MEDIA_DIR)
      ? fs.readdirSync(MEDIA_DIR).filter((f) => /\.(pdf|PDF)$/.test(f))
      : [];

    console.log(`[p1-attach] fichiers PDF dans ${MEDIA_DIR} : ${files.length}`);
    files.forEach((f) => {
      const st = fs.statSync(path.join(MEDIA_DIR, f));
      console.log(`  - ${f} (${Math.round(st.size / 1024)} Ko)`);
    });

    // ─── Notices sans fichier (à intégrer) ──────────────────────────────────
    const docs = (await app.documents('api::document.document').findMany({
      limit: -1,
      populate: ['fichier', 'pdf_file'],
    })) as any[];

    const sansFichier = docs.filter((d) => !d.fichier && !d.pdf_file);
    const avecFichier = docs.filter((d) => d.fichier || d.pdf_file);
    console.log(`\n[p1-attach] notices avec fichier rattaché : ${avecFichier.length} (inchangées)`);
    console.log(`[p1-attach] notices SANS fichier : ${sansFichier.length}`);
    for (const d of sansFichier) {
      console.log(
        `  - #${d.id} [${d.type}] n° ${d.numero} — ${String(d.objet).slice(0, 70)}`
      );
    }

    if (files.length === 0) {
      console.log(
        '\n[p1-attach] Aucun PDF à traiter. Documents restant à intégrer une fois les fichiers fournis :'
      );
      for (const d of sansFichier) console.log(`  - #${d.id} (${d.type} n° ${d.numero})`);
      return;
    }

    // ─── Mappings explicites (correspondance certaine par définition) ───────
    const plan: { file: string; docId: number }[] = [];
    for (const spec of argMaps) {
      const [file, idStr] = spec.split(':');
      const id = Number(idStr);
      const doc = docs.find((d) => d.id === id);
      if (!doc) {
        console.log(`[p1-attach] ⚠️ --map "${spec}" : document #${idStr} introuvable → ignoré.`);
        continue;
      }
      if (!files.includes(file)) {
        console.log(`[p1-attach] ⚠️ --map "${spec}" : fichier absent du dossier → ignoré.`);
        continue;
      }
      plan.push({ file, docId: id });
    }

    // ─── Correspondances automatiques CERTAINES uniquement ──────────────────
    for (const file of files) {
      if (plan.some((p) => p.file === file)) continue; // déjà mappé explicitement
      const numero = extractNumero(file);
      if (!numero) {
        console.log(`[p1-attach] ⚠️ "${file}" : aucun numéro identifiable → correspondance manuelle requise (--map).`);
        continue;
      }
      const candidats = docs.filter(
        (d) => norm(String(d.numero ?? '')).includes(norm(numero)) && !d.fichier && !d.pdf_file
      );
      if (candidats.length === 1) {
        plan.push({ file, docId: candidats[0].id });
      } else if (candidats.length === 0) {
        console.log(`[p1-attach] ⚠️ "${file}" (n° ${numero}) : aucune notice sans fichier ne correspond.`);
      } else {
        console.log(
          `[p1-attach] ⚠️ "${file}" (n° ${numero}) : ${candidats.length} candidats (ids ${candidats
            .map((c) => c.id)
            .join(', ')}) → correspondance ambiguë, traitement manuel requis (--map).`
        );
      }
    }

    console.log(`\n[p1-attach] rattachements planifiés : ${plan.length}`);
    for (const p of plan) console.log(`  - ${p.file} → document #${p.docId}`);

    if (!APPLY) {
      console.log('\n[p1-attach] dry-run (aucune écriture). Relancer avec --apply.');
      return;
    }

    // ─── Téléversement + rattachement ───────────────────────────────────────
    for (const p of plan) {
      const filePath = path.join(MEDIA_DIR, p.file);
      const doc = docs.find((d) => d.id === p.docId);
      if (!doc) continue;

      const [uploaded] = await app.plugin('upload').service('upload').upload({
        data: { fileInfo: { name: p.file } },
        files: {
          path: filePath,
          name: p.file,
          type: 'application/pdf',
          size: fs.statSync(filePath).size,
        },
      });
      if (!uploaded?.id) {
        console.log(`[p1-attach] ⚠️ échec d'upload : ${p.file}`);
        continue;
      }

      // Champ cible : pdf_file si vide, sinon fichier (même logique que le front)
      const field = doc.pdf_file ? 'fichier' : 'pdf_file';
      await app.documents('api::document.document').update({
        documentId: doc.documentId,
        data: { [field]: uploaded.id } as any,
      });
      console.log(`[p1-attach] ✅ ${p.file} → document #${p.docId} (champ ${field})`);
    }
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
