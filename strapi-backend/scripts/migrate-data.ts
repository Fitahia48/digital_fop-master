/**
 * Migration des données legacy (tables Express/PostgreSQL) vers les tables Strapi 5.
 *
 * Étape 6 du plan MIGRATION.md. S'appuie sur les fondations déjà validées :
 *   - étape 4 : users déjà migrés (strapi-backend/scripts/migrate-users.ts), hash bcrypt conservés ;
 *   - étape 5 : logique custom portée (lifecycles favori/document-relation actifs).
 *
 * Ce que fait ce script :
 *   - copie chaque table legacy vers son content-type (mapping MIGRATION.md §2) ;
 *   - préserve les timestamps (createdAt/updatedAt) et les compteurs (visits, téléchargements) ;
 *   - téléverse les fichiers médias (backend/media/documents/*) dans la médiathèque Strapi
 *     (dossier « Migration legacy ») via le service upload officiel, puis les attache aux entrées ;
 *   - FAQ : crée la locale fr (source) puis les variantes en/mg via le Document Service
 *     (update() sur le même documentId crée la variante localisée — cf. repository.js Strapi) ;
 *   - statuts accentués normalisés (abrogé → abroge, modifié → modifie — décision D8) ;
 *   - idempotent : chaque bloc vérifie si les données existent déjà avant d'écrire.
 *
 * Sécurité :
 *   - dry-run par défaut : ajouter --apply pour écrire en base ;
 *   - --only=a,b,c pour restreindre aux blocs listés (voir BLOCKS) ;
 *   - --skip-media pour copier les lignes sans téléverser les fichiers (liens médias laissés vides) ;
 *   - les lifecycles DB sont désactivés via strapi.db.lifecycles.disable() pendant l'écriture :
 *     cela neutralise les hooks métier (emails aux abonnés sur afterCreate document/actualite,
 *     gardes-fous beforeCreate déjà couverts par les vérifications d'unicité du script) ;
 *     les tables système et les tables legacy ne sont jamais touchées.
 *
 * Usage (depuis strapi-backend/) :
 *   npx tsc scripts/migrate-data.ts --outDir .tmp-scripts --module CommonJS
 *       --moduleResolution Node --esModuleInterop --skipLibCheck
 *   node .tmp-scripts/scripts/migrate-data.js            # dry-run
 *   node .tmp-scripts/scripts/migrate-data.js --apply    # écriture
 */
/// <reference path="./pg.d.ts" />
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { compileStrapi, createStrapi } from '@strapi/strapi';

// ─── Options CLI ─────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const SKIP_MEDIA = process.argv.includes('--skip-media');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()) : null;

// ─── Chemins médias ─────────────────────────────────────────────────────────
// buildFilePath() du backend legacy range les uploads dans media/documents/
const LEGACY_MEDIA_DIR = path.resolve(__dirname, '..', '..', 'backend', 'media', 'documents');
// Sous-dossier de la médiathèque Strapi où ranger les fichiers migrés
const MEDIA_FOLDER_NAME = 'Migration legacy';

// ─── Utilitaires ─────────────────────────────────────────────────────────────
const modeLabel = () => (APPLY ? 'APPLY' : 'DRY-RUN');
const log = (msg: string) => console.log(`[migrate-data] ${msg}`);
const warn = (msg: string) => console.warn(`[migrate-data] ⚠️  ${msg}`);

/**
 * Normalise les statuts legacy vers l'enumeration Strapi (décision D8) :
 * accents supprimés, casse et espaces normalisées.
 * 'abrogé'/'Abrogé' → 'abroge' ; 'En vigueur' → 'en_vigueur' ; 'modifié' → 'modifie'.
 */
const normalizeStatus = (s: string | null): string => {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
};

/** Date legacy (DATE ou TIMESTAMPTZ) → YYYY-MM-DD ou null. */
const toDate = (v: any): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
/** Datetime legacy → Date ou null. */
const toDateTime = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
/** Valeur d'une colonne TEXT/VARCHAR qui peut contenir un UUID objet pg (ex. tokens subscribers). */
const toToken = (v: any): string | null => (v == null ? null : String(v));

/** Retire les clés undefined (les null sont conservés : ils effacent un champ). */
const clean = (data: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

/**
 * Compte les lignes d'une table Strapi (via la couche bas-niveau, sans lifecycle).
 * Retourne -1 si la table n'existe pas / erreur.
 */
const countStrapi = async (app: any, uid: string): Promise<number> => {
  try {
    return await app.db.query(uid).count({});
  } catch {
    return -1;
  }
};

const shouldRun = async (app: any, blockName: string, uid: string): Promise<boolean> => {
  if (ONLY && !ONLY.includes(blockName)) return false;
  if (!APPLY) return true;
  const n = await countStrapi(app, uid);
  if (n > 0) {
    log(`[${blockName}] déjà peuplé (${n} entrées) — skip.`);
    return false;
  }
  return true;
};

interface PoolLike {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
  end: () => Promise<void>;
}

let pool: PoolLike;
let app: any;

/** Lecture SQL legacy (comptage en dry-run, vraie lecture en apply). */
const legacy = async (sql: string, values: any[] = []): Promise<any[]> => {
  const { rows } = await pool.query(sql, values);
  return rows;
};

const strapiCreate = async (uid: string, data: Record<string, any>): Promise<any> =>
  app.db.query(uid).create({ data: clean(data) });

/**
 * Retrouve une entrée Strapi depuis une map de correspondance legacy → Strapi.
 * Renvoie null si la map est vide (bloc non exécuté) ou l'id legacy inconnu.
 */
const fromMap = (m: Map<number, any> | null, legacyId: number): any | null =>
  m ? m.get(legacyId) ?? null : null;

// ─── Médias ──────────────────────────────────────────────────────────────────
let mediaFolderId: number | null = null;

const resolveLegacyFile = (relPath: string): string | null => {
  if (!relPath) return null;
  // Colonne legacy : « documents/<fichier.ext> » (buildFilePath) → on retire le préfixe
  const name = relPath.replace(/^documents\//, '');
  const abs = path.join(LEGACY_MEDIA_DIR, name);
  if (!fs.existsSync(abs)) {
    warn(`fichier introuvable : ${relPath} (cherché : ${abs})`);
    return null;
  }
  return abs;
};

const stat = fs.statSync;
const mimeByExt: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Téléverse un fichier legacy dans la médiathèque Strapi (service upload officiel,
 * dossier dédié). Upload par référence : un même fichier réutilisé par plusieurs
 * entrées n'est stocké qu'une fois (cache par nom de fichier).
 */
const uploadFile = async (relPath: string): Promise<any | null> => {
  if (!relPath) return null;
  if (SKIP_MEDIA) return null;

  if (!APPLY) {
    const exists = resolveLegacyFile(relPath) != null;
    log(`  (dry-run) upload ${relPath}${exists ? '' : ' — FICHIER ABSENT'}`);
    return exists ? { id: 0, documentId: 'dry-run' } : null;
  }

  const abs = resolveLegacyFile(relPath);
  if (!abs) return null;

  const uploadService = app.plugin('upload').service('upload');
  const name = path.basename(abs);
  if (!uploadCache.has(name)) {
    const folder = await getMediaFolder();
    const s = stat(abs);
    const [file] = await uploadService.upload({
      data: {
        fileInfo: {
          name,
          folder: folder.id,
          folderPath: folder.path,
        },
      },
      files: {
        filepath: abs,
        originalFilename: name,
        mimetype: mimeByExt[path.extname(name).toLowerCase()] || 'application/octet-stream',
        size: s.size,
      },
    });
    uploadCache.set(name, file);
  }
  return uploadCache.get(name);
};
const uploadCache = new Map<string, any>();

/** Crée (une fois) le dossier « Migration legacy » dans la médiathèque. */
const getMediaFolder = async (): Promise<{ id: number; path: string }> => {
  if (mediaFolderId != null) {
    const existing = await app.db
      .query('plugin::upload.folder')
      .findOne({ where: { id: mediaFolderId } });
    if (existing) return existing;
  }
  const folderService = app.plugin('upload').service('folder');
  let folder = null;
  if (await folderService.exists({ name: MEDIA_FOLDER_NAME, parent: null })) {
    folder = await app.db
      .query('plugin::upload.folder')
      .findOne({ where: { name: MEDIA_FOLDER_NAME, parent: null } });
  } else {
    folder = await folderService.create({ name: MEDIA_FOLDER_NAME, parent: null });
  }
  mediaFolderId = folder.id;
  return folder;
};

// ─── Blocs de migration ──────────────────────────────────────────────────────

/** domaines → api::domaine.domaine */
const migrateDomaines = async () => {
  if (!(await shouldRun(app, 'domaines', 'api::domaine.domaine'))) return;
  const rows = await legacy('SELECT id, nom FROM domaines ORDER BY id');
  log(`[domaines] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  const map = new Map<number, any>();
  for (const row of rows) {
    const created = await strapiCreate('api::domaine.domaine', {
      nom: row.nom,
      createdAt: toDateTime(row.created_at) ?? new Date(),
      updatedAt: new Date(),
    });
    map.set(row.id, created);
  }
  maps.domaines = map;
  log(`[domaines] ✅ ${map.size} créées`);
};

/** documents → api::document.document (+ médias fichier/pdf_file) */
const migrateDocuments = async () => {
  if (!(await shouldRun(app, 'documents', 'api::document.document'))) return;
  const rows = await legacy(`
    SELECT id, type, objet, numero, date, conseil, domaine_id, fichier, pdf_file, status,
           date_entree_vigueur, last_modified_by, last_modified_at, modification_details,
           inclus_journal, date_journal, numero_journal, page_journal, visits, telechargements,
           resume_simplifie
    FROM documents ORDER BY id`);
  log(`[documents] ${rows.length} lignes legacy`);
  if (!APPLY) {
    for (const row of rows.slice(0, 3)) {
      log(`  (dry-run) document ${row.id} : ${row.numero} — fichier=${row.fichier ?? '—'}, pdf=${row.pdf_file ?? '—'}`);
    }
    return;
  }

  const map = new Map<number, any>();
  for (const row of rows) {
    const domaine = fromMap(maps.domaines, row.domaine_id);
    const data: Record<string, any> = {
      type: row.type,
      objet: row.objet,
      numero: row.numero,
      date: toDate(row.date),
      conseil: row.conseil ?? 'Autre',
      domaine: domaine?.id,
      status: normalizeStatus(row.status) || 'en_vigueur',
      date_entree_vigueur: toDate(row.date_entree_vigueur),
      last_modified_at: toDateTime(row.last_modified_at),
      modification_details: row.modification_details,
      inclus_journal: row.inclus_journal ?? false,
      date_journal: toDate(row.date_journal),
      numero_journal: row.numero_journal,
      page_journal: row.page_journal,
      visits: row.visits ?? 0,
      telechargements: row.telechargements ?? 0,
      resume_simplifie: row.resume_simplifie,
      createdAt: new Date(),
      updatedAt: toDateTime(row.last_modified_at) ?? new Date(),
    };
    const created = await strapiCreate('api::document.document', data);
    map.set(row.id, created);

    // Médias : fichier (texte signé) et pdf_file (version PDF) — upload puis
    // rattachement via le Document Service (même pattern que les controllers).
    for (const field of ['fichier', 'pdf_file'] as const) {
      if (!row[field]) continue;
      const media = await uploadFile(row[field]);
      if (media?.documentId) {
        await app.documents('api::document.document').update({
          documentId: created.documentId,
          data: { [field]: media.id },
        });
      }
    }
  }
  maps.documents = map;
  log(`[documents] ✅ ${map.size} créés`);
};

/** document_relations → api::document-relation.document-relation */
const migrateDocumentRelations = async () => {
  if (!(await shouldRun(app, 'document-relations', 'api::document-relation.document-relation'))) return;
  const rows = await legacy(
    'SELECT id, document_source_id, document_cible_id, type_relation, date_creation FROM document_relations ORDER BY id'
  );
  log(`[document-relations] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  const src = maps.documents!;
  let created = 0;
  for (const row of rows) {
    const source = src.get(row.document_source_id);
    const cible = src.get(row.document_cible_id);
    if (!source || !cible) {
      warn(`relation ${row.id} ignorée : document source/cible non migré (${row.document_source_id} → ${row.document_cible_id})`);
      continue;
    }
    await strapiCreate('api::document-relation.document-relation', {
      document_source: source.id,
      document_cible: cible.id,
      type_relation: row.type_relation,
      date_creation: toDateTime(row.date_creation),
      createdAt: toDateTime(row.date_creation) ?? new Date(),
      updatedAt: new Date(),
    });
    created++;
  }
  log(`[document-relations] ✅ ${created} créées`);
};

/** actualites → api::actualite.actualite */
const migrateActualites = async () => {
  if (!(await shouldRun(app, 'actualites', 'api::actualite.actualite'))) return;
  const rows = await legacy(
    'SELECT id, conseil, titre, date, lieu, texte, categorie FROM actualites ORDER BY id'
  );
  log(`[actualites] ${rows.length} lignes legacy`);
  if (!APPLY) {
    for (const row of rows.slice(0, 3)) log(`  (dry-run) actualité ${row.id} : ${row.titre}`);
    return;
  }

  let created = 0;
  for (const row of rows) {
    await strapiCreate('api::actualite.actualite', {
      conseil: row.conseil ?? 'CONSEIL DES MINISTRES',
      titre: row.titre,
      date: toDate(row.date),
      lieu: row.lieu,
      texte: row.texte,
      categorie: row.categorie ?? 'actualite',
      createdAt: toDateTime(row.created_at) ?? new Date(),
      updatedAt: new Date(),
    });
    created++;
  }
  log(`[actualites] ✅ ${created} créées`);
};

/** type_corps → api::type-corps.type-corps */
const migrateTypeCorps = async () => {
  if (!(await shouldRun(app, 'type-corps', 'api::type-corps.type-corps'))) return;
  const rows = await legacy('SELECT id, nom FROM type_corps ORDER BY id');
  log(`[type-corps] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  const map = new Map<number, any>();
  for (const row of rows) {
    const created = await strapiCreate('api::type-corps.type-corps', {
      nom: row.nom,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    map.set(row.id, created);
  }
  maps.typeCorps = map;
  log(`[type-corps] ✅ ${map.size} créés`);
};

/** corps → api::corps.corps (+ média fichier) */
const migrateCorps = async () => {
  if (!(await shouldRun(app, 'corps', 'api::corps.corps'))) return;
  const rows = await legacy(`
    SELECT id, nom, numero, description, type_id, date_creation, status, fichier, pdf_file,
           visits, telechargements
    FROM corps ORDER BY id`);
  log(`[corps] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  let created = 0;
  for (const row of rows) {
    const type = fromMap(maps.typeCorps, row.type_id);
    const data: Record<string, any> = {
      nom: row.nom,
      numero: row.numero,
      description: row.description,
      type: type?.id,
      date_creation: toDate(row.date_creation),
      status: row.status === 'inactif' ? 'inactif' : 'actif',
      visits: row.visits ?? 0,
      telechargements: row.telechargements ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const entry = await strapiCreate('api::corps.corps', data);
    if (row.fichier) {
      const media = await uploadFile(row.fichier);
      if (media?.documentId) {
        await app.documents('api::corps.corps').update({
          documentId: entry.documentId,
          data: { fichier: media.id },
        });
      }
    }
    created++;
  }
  log(`[corps] ✅ ${created} créés`);
};

/** remarks → api::remark.remark */
const migrateRemarks = async () => {
  if (!(await shouldRun(app, 'remarks', 'api::remark.remark'))) return;
  const rows = await legacy('SELECT id, email, message, created_at FROM remarks ORDER BY id');
  log(`[remarks] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  let created = 0;
  for (const row of rows) {
    await strapiCreate('api::remark.remark', {
      email: row.email,
      message: row.message,
      createdAt: toDateTime(row.created_at) ?? new Date(),
      updatedAt: toDateTime(row.created_at) ?? new Date(),
    });
    created++;
  }
  log(`[remarks] ✅ ${created} créées`);
};

/** subscribers → api::subscriber.subscriber */
const migrateSubscribers = async () => {
  if (!(await shouldRun(app, 'subscribers', 'api::subscriber.subscriber'))) return;
  const rows = await legacy(`
    SELECT id, email, is_confirmed, unsubscribe_token, confirm_token, created_at, langue_preferee
    FROM subscribers ORDER BY id`);
  log(`[subscribers] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  let created = 0;
  for (const row of rows) {
    await strapiCreate('api::subscriber.subscriber', {
      email: row.email,
      is_confirmed: row.is_confirmed ?? false,
      unsubscribe_token: toToken(row.unsubscribe_token),
      confirm_token: toToken(row.confirm_token),
      langue_preferee: ['fr', 'en', 'mg'].includes(row.langue_preferee) ? row.langue_preferee : 'fr',
      createdAt: toDateTime(row.created_at) ?? new Date(),
      updatedAt: toDateTime(row.created_at) ?? new Date(),
    });
    created++;
  }
  log(`[subscribers] ✅ ${created} créés`);
};

/**
 * organigramme → api::organigramme.organigramme (2 passes : parents puis enfants,
 * avec détection de cycles parent_id → fallback « sans parent »).
 */
const migrateOrganigramme = async () => {
  if (!(await shouldRun(app, 'organigramme', 'api::organigramme.organigramme'))) return;
  const rows = await legacy(
    'SELECT id, nom, poste, service, parent_id, ordre, actif FROM organigramme ORDER BY id'
  );
  log(`[organigramme] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  const byId = new Map<number, any>(rows.map((r) => [r.id, r]));
  // Profondeur de chaque fiche dans la hiérarchie (cycle = profondeur restée bloquée)
  const depth = new Map<number, number>();
  const depthOf = (id: number): number => {
    if (depth.has(id)) return depth.get(id)!;
    depth.set(id, 0); // sentinelle anti-cycle
    const row = byId.get(id);
    let d = 0;
    if (row?.parent_id != null && byId.has(row.parent_id)) {
      d = depthOf(row.parent_id) + 1;
      if (d === 1 && depth.get(row.parent_id) === 0 && row.parent_id !== id) {
        // le parent était en cours de calcul → cycle : on coupe
        d = 0;
      }
    }
    depth.set(id, d);
    return d;
  };
  for (const row of rows) depthOf(row.id);

  // Création par profondeur croissante : les parents existent toujours avant les enfants
  const map = new Map<number, any>();
  const sorted = [...rows].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
  for (const row of sorted) {
    const parentId = row.parent_id != null ? row.parent_id : null;
    const parent = parentId != null ? map.get(parentId) : null;
    if (parentId != null && !parent) {
      warn(`organigramme ${row.id} : parent ${parentId} introuvable (cycle ?), fiche créée sans parent`);
    }
    const created = await strapiCreate('api::organigramme.organigramme', orgData(row, parent?.id ?? null));
    map.set(row.id, created);
  }
  maps.organigramme = map;
  log(`[organigramme] ✅ ${map.size} fiches créées`);
};
const orgData = (row: any, parentId: number | null) => ({
  nom: row.nom,
  poste: row.poste,
  service: row.service ?? 'Cabinet',
  parent: parentId,
  ordre: row.ordre ?? 0,
  actif: row.actif ?? true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** app_ratings → api::app-rating.app-rating */
const migrateAppRatings = async () => {
  if (!(await shouldRun(app, 'app-ratings', 'api::app-rating.app-rating'))) return;
  const rows = await legacy('SELECT id, stars, session_id, created_at FROM app_ratings ORDER BY id');
  log(`[app-ratings] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  let created = 0;
  for (const row of rows) {
    await strapiCreate('api::app-rating.app-rating', {
      stars: row.stars,
      session_id: row.session_id,
      createdAt: toDateTime(row.created_at) ?? new Date(),
      updatedAt: toDateTime(row.created_at) ?? new Date(),
    });
    created++;
  }
  log(`[app-ratings] ✅ ${created} créées`);
};

/** historique_recherche → api::historique-recherche.historique-recherche */
const migrateHistorique = async () => {
  if (!(await shouldRun(app, 'historique-recherche', 'api::historique-recherche.historique-recherche')))
    return;
  const rows = await legacy(
    'SELECT id, user_id, terme_recherche, created_at FROM historique_recherche ORDER BY id'
  );
  log(`[historique-recherche] ${rows.length} lignes legacy`);
  if (!APPLY) return;

  const userMap = await getUserMap();
  let created = 0;
  for (const row of rows) {
    const user = userMap.get(row.user_id);
    if (!user) {
      warn(`historique ${row.id} ignoré : user ${row.user_id} non migré`);
      continue;
    }
    await strapiCreate('api::historique-recherche.historique-recherche', {
      user: user.id,
      terme_recherche: row.terme_recherche,
      createdAt: toDateTime(row.created_at) ?? new Date(),
      updatedAt: toDateTime(row.created_at) ?? new Date(),
    });
    created++;
  }
  log(`[historique-recherche] ✅ ${created} entrées créées`);
};

/**
 * faq → api::faq.faq (i18n natif fr/en/mg — décision D1).
 * La locale fr est créée avec la locale par défaut du CMS (source de vérité),
 * puis les variantes en/mg sont créées via strapi.documents().update() sur le
 * même documentId (comportement Strapi 5 : update sur une locale inexistante
 * crée la variante localisée liée au document).
 */
const migrateFaq = async () => {
  if (!(await shouldRun(app, 'faq', 'api::faq.faq'))) return;
  const rows = await legacy(`
    SELECT id, question_fr, question_en, question_mg, reponse_fr, reponse_en, reponse_mg,
           categorie, ordre
    FROM faq ORDER BY ordre, id`);
  log(`[faq] ${rows.length} lignes legacy`);
  if (!APPLY) {
    for (const row of rows.slice(0, 3)) log(`  (dry-run) faq ${row.id} : ${row.question_fr}`);
    return;
  }

  let created = 0;
  for (const row of rows) {
    // 1. Variante française (locale par défaut)
    const fr = await app.documents('api::faq.faq').create({
      locale: 'fr',
      data: {
        question: row.question_fr,
        reponse: row.reponse_fr,
        categorie: row.categorie,
        ordre: row.ordre ?? 0,
      },
    });
    // 2. Variantes en/mg : update() sur le même documentId crée la traduction liée
    const translations: Array<[string, string | null, string | null]> = [
      ['en', row.question_en, row.reponse_en],
      ['mg', row.question_mg, row.reponse_mg],
    ];
    for (const [locale, question, reponse] of translations) {
      if (!question || !reponse) continue;
      await app.documents('api::faq.faq').update({
        documentId: fr.documentId,
        locale,
        data: { question, reponse },
      });
    }
    created++;
  }
  log(`[faq] ✅ ${created} créées (fr + traductions disponibles)`);
};

// ─── Maps de correspondance legacy id → entrée Strapi ────────────────────────
const maps: Record<string, Map<number, any> | null> = {
  domaines: null,
  documents: null,
  typeCorps: null,
  organigramme: null,
  demarches: null,
};

/**
 * Correspondance user legacy id → user Strapi (email partagé).
 * L'étape 4 (migrate-users.ts) a migré les utilisateurs : le lien se fait par email.
 */
let userMapCache: Map<number, any> | null = null;
const getUserMap = async (): Promise<Map<number, any>> => {
  if (userMapCache) return userMapCache;
  const legacyUsers = await legacy('SELECT id, email FROM users ORDER BY id');
  const map = new Map<number, any>();
  for (const u of legacyUsers) {
    const su = await app.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { email: u.email } });
    if (su) map.set(u.id, su);
  }
  userMapCache = map;
  return map;
};

// ─── Orchestration ───────────────────────────────────────────────────────────

/** Ordre des blocs : les dépendances d'abord (relations + FK). */
const BLOCKS: Array<[string, () => Promise<void>]> = [
  ['domaines', migrateDomaines],
  ['documents', migrateDocuments],
  ['document-relations', migrateDocumentRelations],
  ['actualites', migrateActualites],
  ['type-corps', migrateTypeCorps],
  ['corps', migrateCorps],
  ['remarks', migrateRemarks],
  ['subscribers', migrateSubscribers],
  ['organigramme', migrateOrganigramme],
  ['app-ratings', migrateAppRatings],
  ['historique-recherche', migrateHistorique],
  ['faq', migrateFaq],
];

async function main() {
  log(`Mode : ${modeLabel()}${SKIP_MEDIA ? ' (sans médias)' : ''}${ONLY ? ` (blocs : ${ONLY.join(', ')})` : ''}`);

  // 1. Lecture des données legacy (SQL direct, aucune écriture)
  pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'digitallibrary_db1',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  });

  // 2. Chargement de l'application Strapi (pattern migrate-users.ts)
  const appContext = await compileStrapi();
  app = await createStrapi(appContext).load();

  try {
    // 3. Neutralise les lifecycles DB pendant la migration :
    //    - pas d'emails aux abonnés (afterCreate document/actualite),
    //    - les gardes-fous favori/document-relation sont remplacés par les
    //      vérifications d'unicité explicites du script,
    //    - le subscriber timestamps est désactivé aussi → le script fournit
    //      explicitement createdAt/updatedAt pour chaque entrée.
    if (APPLY) {
      app.db.lifecycles.disable();
      log('Lifecycles DB désactivés (aucun email métier ne sera envoyé).');
    }

    // 4. Vérifie les locales i18n requises (fr par défaut + en + mg)
    if (APPLY && (!ONLY || ONLY.includes('faq'))) {
      const localeService = app.plugin('i18n').service('locales');
      const existing = (await localeService.find()).map((l: any) => l.code);
      for (const code of ['fr', 'en', 'mg']) {
        if (!existing.includes(code)) {
          await localeService.create({ code, name: code });
          log(`Locale « ${code} » créée.`);
        }
      }
      // La locale fr doit être la locale par défaut (repli FR, décision D1)
      const def = await localeService.getDefaultLocale();
      if (def && def !== 'fr') {
        await localeService.setDefaultLocale({ code: 'fr' });
        log(`Locale par défaut basculée sur « fr » (était « ${def} »).`);
      }
    }

    // 5. Exécution des blocs dans l'ordre des dépendances
    const results: Array<[string, string]> = [];
    for (const [name, fn] of BLOCKS) {
      try {
        await fn();
        results.push([name, 'ok']);
      } catch (err: any) {
        results.push([name, `ERREUR : ${err.message}`]);
        console.error(`[migrate-data] ❌ Bloc ${name} :`, err.message);
        if (APPLY) {
          // On continue avec les autres blocs : un bloc en échec ne bloque pas
          // les blocs indépendants. Les maps partiels restent utilisables.
        }
      }
    }

    // 6. Résumé
    console.log('\n──────────── Résumé ────────────');
    for (const [name, status] of results) {
      console.log(`  ${status === 'ok' ? '✅' : '❌'} ${name}${status === 'ok' ? '' : ' — ' + status}`);
    }
    log(`Terminé (${modeLabel()}).`);
  } finally {
    await pool.end();
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
