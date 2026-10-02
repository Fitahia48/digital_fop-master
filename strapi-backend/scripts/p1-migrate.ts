/**
 * P1 — Migration idempotente des types de documents + états de notice.
 *
 * 1. Normalise les valeurs de `documents.type` vers la liste contrôlée
 *    (fautes, casse, accents, pluriels → forme canonique).
 * 2. Ne touche JAMAIS aux valeurs inconnues : elles sont listées en fin de
 *    rapport pour examen manuel (aucune donnée perdue, aucune invention).
 * 3. Pose `etat_notice = 'brouillon'` sur toute notice dont l'état est vide
 *    (les documents migrés depuis l'ancienne table n'ont pas ce champ).
 *
 * Idempotence : réexécution sans effet une fois appliquée (les valeurs sont
 * déjà canoniques et `etat_notice` déjà renseigné).
 *
 * CLI :
 *   --dry-run (défaut) : affiche le plan, n'écrit rien ;
 *   --apply            : effectue les mises à jour.
 *
 * Compilation (cf. pièges documentés dans MIGRATION.md, étape 4) :
 *   npx tsc scripts/p1-migrate.ts --outDir .tmp-scripts --module CommonJS
 *     --moduleResolution Node --esModuleInterop --skipLibCheck
 *   node .tmp-scripts/p1-migrate.js [--apply]
 */
import { compileStrapi, createStrapi } from '@strapi/strapi';
import path from 'path';
// Source de vérité partagée (même logique testée dans tests/p1-normalizer.test.cjs).
// Résolution absolue : le script compilé vit dans .tmp-scripts/, pas à côté du source.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { canonicalizeType } = require(path.resolve(
  __dirname,
  '..',
  'scripts',
  'p1-normalizer.js'
)) as { canonicalizeType: (raw: unknown) => string | null };

const APPLY = process.argv.includes('--apply');
const UID = 'api::document.document';

// ⚠️ Liste contrôlée et alias VIVENT dans `scripts/p1-normalizer.js`
// (source unique partagée avec le front `front/src/utils/documentTypes.js`
// et testée dans `tests/p1-normalizer.test.cjs`) — plus aucune duplication ici.

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    const rows = (await app.documents(UID).findMany({
      limit: -1,
    })) as any[];

    let toFixTypes = 0;
    let toFixEtat = 0;
    const unknownValues = new Map<string, { count: number; ids: number[] }>();

    for (const row of rows) {
      const rawType = String(row.type ?? '').trim();
      // Module partagé : reconnaît alias ET formes canoniques (idempotence
      // garantie — une valeur déjà convertie n'est plus « inconnue »).
      const canon = canonicalizeType(rawType);

      if (canon === null && rawType) {
        const k = rawType;
        const entry = unknownValues.get(k) ?? { count: 0, ids: [] };
        entry.count += 1;
        entry.ids.push(row.id);
        unknownValues.set(k, entry);
        continue; // valeur inconnue : on ne la modifie PAS
      }

      const needsType = canon !== null && canon !== rawType;
      const needsEtat = !row.etat_notice;
      if (needsType) toFixTypes += 1;
      if (needsEtat) toFixEtat += 1;

      if (needsType || needsEtat) {
        if (APPLY) {
          await app.documents(UID).update({
            documentId: row.documentId,
            data: {
              ...(needsType ? { type: canon } : {}),
              ...(needsEtat ? { etat_notice: 'brouillon' as const } : {}),
            } as any,
          });
        } else if (needsType) {
          console.log(`  [dry-run] doc #${row.id} : type "${rawType}" → "${canon}"`);
        }
      }
    }

    console.log(`[p1-migrate] documents analysés : ${rows.length}`);
    console.log(
      `[p1-migrate] types à normaliser : ${toFixTypes} ; etat_notice à poser (brouillon) : ${toFixEtat}`
    );

    if (unknownValues.size > 0) {
      console.log('\n[p1-migrate] ⚠️ VALEURS DE TYPE INCONNUES (non modifiées — à examiner manuellement) :');
      Array.from(unknownValues.entries()).forEach(([value, { count, ids }]) => {
        console.log(`  - "${value}" : ${count} doc(s), ids ${ids.join(', ')}`);
      });
    } else {
      console.log('[p1-migrate] aucune valeur de type inconnue.');
    }

    console.log(APPLY ? '\n[p1-migrate] ✅ modifications APPLIQUÉES.' : '\n[p1-migrate] dry-run (aucune écriture). Relancer avec --apply.');
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
