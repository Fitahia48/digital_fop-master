/**
 * Préparation de la base de TEST (copie) pour tests/comptage-e2e.test.mjs.
 * N'écrit QUE dans `.tmp-test/data.db` — la base de développement reste intacte.
 *
 *   node tests/prep-e2e.cjs
 *
 *  1. passe le document id=14 en « brouillon » (test : un brouillon ne se compte pas) ;
 *  2. crée un corps professionnel de test (idéogramme `numero` unique) ;
 *  3. réinitialise le mot de passe de l'admin de test (auth statistics).
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', '.tmp-test', 'data.db');
const db = new Database(dbPath);

// 1. Brouillon de test
db.prepare("UPDATE strapi_documents SET etat_notice = 'brouillon' WHERE id = 14").run();
const brouillon = db.prepare('SELECT id, etat_notice FROM strapi_documents WHERE id = 14').get();
console.log('[OK] document id=14 →', brouillon.etat_notice);

// 2. Corps de test (numero unique, description, date_creation : requis)
const numero = 'TEST-E2E-2026';
let corps = db.prepare('SELECT id, visits FROM strapi_corps WHERE numero = ?').get(numero);
if (!corps) {
  const info = db
    .prepare(
      `INSERT INTO strapi_corps (document_id, nom, numero, description, date_creation, status, visits, telechargements, created_at, updated_at, published_at, locale)
       VALUES (?, ?, ?, ?, ?, 'actif', 0, 0, ?, ?, ?, NULL)`
    )
    .run(
      crypto.randomBytes(12).toString('hex'),
      'Corps de test e2e',
      numero,
      'Corps créé pour les tests de comptage (base de test uniquement).',
      '2026-01-01',
      Date.now(),
      Date.now(),
      Date.now()
    );
  corps = { id: Number(info.lastInsertRowid), visits: 0 };
  console.log('[OK] corps de test créé id=', corps.id);
} else {
  db.prepare('UPDATE strapi_corps SET visits = 0 WHERE id = ?').run(corps.id);
  console.log('[OK] corps de test déjà présent id=', corps.id, '(visits remis à 0)');
}
console.log('CORPS_ID=' + corps.id);

// 3. Admin de test (rôle « Administrateur » déjà lié — voir up_users_role_lnk)
const email = 'admin.test@mtefop.mg';
const admin = db.prepare('SELECT id FROM up_users WHERE LOWER(email) = ?').get(email.toLowerCase());
if (admin) {
  db.prepare('UPDATE up_users SET password = ?, confirmed = 1, blocked = 0 WHERE id = ?').run(
    bcrypt.hashSync('TestAdmin2026!', 10),
    admin.id
  );
  console.log('[OK] mot de passe de', email, 'réinitialisé (base de test)');
} else {
  console.log('[KO] admin de test introuvable :', email);
  process.exitCode = 1;
}

console.log('BROUILLON_ID=14');
db.close();
