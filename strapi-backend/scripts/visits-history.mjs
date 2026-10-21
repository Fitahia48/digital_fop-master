/**
 * Table legacy `visits` (IP EN CLAIR, comptait des requêtes) — traitement en
 * 3 étapes séparées, chacune explicite :
 *
 *   1. EXPORT  (non destructif, exécutable sans accord supplémentaire) :
 *        node --env-file=.env scripts/visits-history.mjs export
 *      → CSV complet dans .tmp-scripts/visits-export-<horodatage>.csv +
 *        résumé (lignes, IP distinctes, jours) AFFICHÉ à l'écran.
 *
 *   2. AGGREGAT (TRANSFORME — nécessite l'accord explicite) :
 *        node --env-file=.env scripts/visits-history.mjs aggregate --apply
 *      → remplit `visits_historique_jour(jour, visites, visiteurs_distincts)`
 *        (COUNT(*) et COUNT(DISTINCT ip_address) par jour) : l'historique des
 *        VISITEURS DISTINCTS est conservé SANS AUCUNE IP.
 *
 *   3. ANONYMISATION (DESTRUCTIF — nécessite l'accord explicite + export
 *      réalisé au préalable) :
 *        node --env-file=.env scripts/visits-history.mjs anonymize --apply
 *      → ip_address / user_agent remplacés par NULL (colonnes conservées pour
 *        ne pas casser le schéma).
 *
 * Règles : sans `--apply`, les étapes 2 et 3 ne font que SIMULER (dry-run).
 * Aucune IP n'est journalisée : l'export est un FICHIER local, le résumé
 * n'affiche que des compteurs.
 *
 * Comptage métier : voir src/utils/comptage.ts + IMPLEMENTATION.md §Comptage.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createConnection } = require('@strapi/database/dist/connection.js');

const dossier = path.dirname(fileURLToPath(import.meta.url));
const racineBackend = path.resolve(dossier, '..');

const mode = process.argv[2] || 'export';
const appliquer = process.argv.includes('--apply');

const MODES_VALIDES = ['export', 'aggregate', 'anonymize'];
if (!MODES_VALIDES.includes(mode)) {
  console.error(`Mode inconnu « ${mode} ». Modes : ${MODES_VALIDES.join(' | ')}`);
  process.exit(1);
}

/** Configuration de connexion identique à config/database.ts (sqlite par défaut). */
const connexion = () => {
  const client = process.env.DATABASE_CLIENT || 'sqlite';
  if (client === 'postgres') {
    return {
      client: 'postgres',
      connection: {
        connectionString: process.env.DATABASE_URL || undefined,
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'digitallibrary_db1',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      },
    };
  }
  if (client !== 'sqlite') throw new Error(`DATABASE_CLIENT non géré : ${client}`);
  const fichier = process.env.DATABASE_FILENAME || '.tmp/data.db';
  const candidats = [
    path.resolve(racineBackend, fichier),
    path.resolve(racineBackend, '..', fichier),
  ];
  const trouve = candidats.find((c) => fs.existsSync(c)) || candidats[0];
  return { client: 'sqlite', connection: { filename: trouve }, useNullAsDefault: true };
};

const csvEchappe = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const main = async () => {
  const db = await createConnection(connexion());

  const existe = await db.schema.hasTable('visits');
  if (!existe) {
    console.log("Table `visits` absente de cette base : rien à traiter.");
    await db.destroy();
    return;
  }

  const total = (await db('visits').count('* as n').first())?.n ?? 0;
  const ipsDistinctes = await db('visits').countDistinct('ip_address as n').first();
  const jours = await db('visits').countDistinct('visit_date as n').first();

  if (mode === 'export') {
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dossierSortie = path.resolve(racineBackend, '.tmp-scripts');
    fs.mkdirSync(dossierSortie, { recursive: true });
    const fichier = path.join(dossierSortie, `visits-export-${horodatage}.csv`);

    const lignes = await db('visits').select('id', 'ip_address', 'user_agent', 'visit_date');
    const contenu = ['id,ip_address,user_agent,visit_date']
      .concat(lignes.map((l) => [l.id, l.ip_address, l.user_agent, l.visit_date].map(csvEchappe).join(',')))
      .join('\n');
    fs.writeFileSync(fichier, contenu, 'utf8');

    console.log('── EXPORT de la table `visits` (non destructif) ──');
    console.log(`  lignes             : ${total}`);
    console.log(`  jours distincts    : ${jours?.n ?? 0}`);
    console.log(`  IP distinctes      : ${ipsDistinctes?.n ?? 0}`);
    console.log(`  fichier écrit      : ${fichier}`);
    console.log(
      `  ATTENTION : ce CSV contient des IP en clair — ${'conservé localement, ne pas committer'} (déjà couvert par .gitignore ?).`
    );
  }

  if (mode === 'aggregate') {
    if (!(await db.schema.hasTable('visits_historique_jour'))) {
      const creation = `CREATE TABLE visits_historique_jour (
        jour DATE PRIMARY KEY,
        visites BIGINT NOT NULL,
        visiteurs_distincts BIGINT NOT NULL,
        agreg_le TIMESTAMP
      )`;
      if (appliquer) await db.raw(creation);
      else console.log('[dry-run] CREATE TABLE visits_historique_jour …');
    }

    const sql = `INSERT INTO visits_historique_jour (jour, visites, visiteurs_distincts, agreg_le)
      SELECT visit_date, COUNT(*), COUNT(DISTINCT ip_address), CURRENT_TIMESTAMP
      FROM visits GROUP BY visit_date
      ON CONFLICT (jour) DO UPDATE SET
        visites = excluded.visites,
        visiteurs_distincts = excluded.visiteurs_distincts,
        agreg_le = CURRENT_TIMESTAMP`;

    const apercu = await db('visits')
      .select('visit_date')
      .count('* as visites')
      .countDistinct('ip_address as visiteurs_distincts')
      .groupBy('visit_date')
      .orderBy('visit_date');

    if (appliquer) {
      const brut = await db.raw(sql);
      const lignes = brut?.changes ?? brut?.rowCount ?? 0;
      console.log(`── AGRÉGAT appliqué : ${lignes} jours dans visits_historique_jour ──`);
    } else {
      console.log('[dry-run] agrégat par jour (aucune écriture) :');
      for (const l of apercu) {
        console.log(`  ${l.visit_date} : ${l.visites} visites → ${l.visiteurs_distincts} visiteurs distincts`);
      }
      console.log('  Relancez avec --apply pour écrire ces totaux.');
    }
  }

  if (mode === 'anonymize') {
    const derniersExports = fs
      .readdirSync(path.resolve(racineBackend, '.tmp-scripts'))
      .filter((f) => f.startsWith('visits-export-') && f.endsWith('.csv'));

    if (appliquer && derniersExports.length === 0) {
      console.error('REFUS : aucun export CSV trouvé — lancez d’abord « export ».');
      process.exit(1);
    }

    const sql = 'UPDATE visits SET ip_address = NULL, user_agent = NULL';
    if (appliquer) {
      const brut = await db.raw(sql);
      const lignes = brut?.changes ?? brut?.rowCount ?? 0;
      console.log(`── ANONYMISATION appliquée : ${lignes} lignes vidées (ip_address/user_agent = NULL) ──`);
      const reste = await db('visits').whereNotNull('ip_address').count('* as n').first();
      console.log(`  IP restantes en clair dans visits : ${reste?.n ?? 0}`);
    } else {
      console.log('[dry-run] UPDATE visits SET ip_address = NULL, user_agent = NULL (aucune écriture)');
      console.log('  Relancez avec --apply pour appliquer (export obligatoire au préalable).');
    }
  }

  await db.destroy();
};

main().catch((err) => {
  console.error(`Échec (${mode}) : ${err.message}`);
  process.exit(1);
});
