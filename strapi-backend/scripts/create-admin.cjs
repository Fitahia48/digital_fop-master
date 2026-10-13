const Database = require('d:/Monprojet/projetDRFP/digital_fop-master/strapi-backend/node_modules/better-sqlite3');
const bcrypt = require('d:/Monprojet/projetDRFP/digital_fop-master/strapi-backend/node_modules/bcryptjs');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.resolve('d:/Monprojet/projetDRFP/digital_fop-master/strapi-backend/.tmp/data.db');
const db = new Database(dbPath);

function randomDocId() {
  return crypto.randomBytes(12).toString('hex');
}

const now = Date.now();

// 1. Assurer le rôle "Administrateur" dans up_roles
let adminRole = db.prepare("SELECT * FROM up_roles WHERE name = 'Administrateur'").get();
if (!adminRole) {
  const docId = randomDocId();
  const insertRole = db.prepare(`
    INSERT INTO up_roles (document_id, name, description, type, created_at, updated_at, published_at)
    VALUES (?, 'Administrateur', 'Rôle administrateur', 'administrateur', ?, ?, ?)
  `);
  const info = insertRole.run(docId, now, now, now);
  adminRole = db.prepare("SELECT * FROM up_roles WHERE id = ?").get(info.lastInsertRowid);
  console.log('[OK] Rôle Administrateur créé avec id:', adminRole.id);
} else {
  console.log('[INFO] Rôle Administrateur déjà présent avec id:', adminRole.id);
}

// 2. Assurer les permissions pour Administrateur dans up_permissions_role_lnk
const allPermissions = db.prepare("SELECT id FROM up_permissions").all();
const existingAdminPerms = db.prepare("SELECT permission_id FROM up_permissions_role_lnk WHERE role_id = ?").all(adminRole.id);
const existingPermIds = new Set(existingAdminPerms.map(p => p.permission_id));

const insertPermLink = db.prepare(`
  INSERT INTO up_permissions_role_lnk (permission_id, role_id, permission_ord)
  VALUES (?, ?, ?)
`);

let addedPerms = 0;
allPermissions.forEach((perm, idx) => {
  if (!existingPermIds.has(perm.id)) {
    insertPermLink.run(perm.id, adminRole.id, idx + 1);
    addedPerms++;
  }
});
console.log(`[OK] Permissions associées au rôle Administrateur : ${addedPerms} nouvelles (total: ${allPermissions.length})`);

// 3. Fonction pour créer ou mettre à jour un compte dans up_users
function upsertUpUser(email, password, nom, prenom) {
  const lowerEmail = email.toLowerCase().trim();
  const hashedPassword = bcrypt.hashSync(password, 10);
  let user = db.prepare("SELECT * FROM up_users WHERE LOWER(email) = ?").get(lowerEmail);

  if (user) {
    db.prepare(`
      UPDATE up_users 
      SET password = ?, confirmed = 1, blocked = 0, nom = ?, prenom = ?, updated_at = ?
      WHERE id = ?
    `).run(hashedPassword, nom, prenom, now, user.id);

    // Mettre à jour le lien rôle
    db.prepare("DELETE FROM up_users_role_lnk WHERE user_id = ?").run(user.id);
    db.prepare("INSERT INTO up_users_role_lnk (user_id, role_id, user_ord) VALUES (?, ?, 1)").run(user.id, adminRole.id);

    console.log(`[OK] Utilisateur existant mis à jour : ${lowerEmail} (rôle: Administrateur)`);
  } else {
    const docId = randomDocId();
    const insertUser = db.prepare(`
      INSERT INTO up_users (document_id, username, email, provider, password, confirmed, blocked, nom, prenom, langue_preferee, created_at, updated_at, published_at)
      VALUES (?, ?, ?, 'local', ?, 1, 0, ?, ?, 'fr', ?, ?, ?)
    `);
    const info = insertUser.run(docId, lowerEmail, lowerEmail, hashedPassword, nom, prenom, now, now, now);
    const userId = info.lastInsertRowid;

    db.prepare("INSERT INTO up_users_role_lnk (user_id, role_id, user_ord) VALUES (?, ?, 1)").run(userId, adminRole.id);
    console.log(`[OK] Nouvel utilisateur créé : ${lowerEmail} (id: ${userId}, rôle: Administrateur)`);
  }
}

// Créer / mettre à jour les comptes souhaités
upsertUpUser('admin.test@mtefop.mg', 'TestAdmin2026!', 'Admin', 'Test');
upsertUpUser('admin@digitalfop.mg', 'Admin2026!', 'Admin', 'DigitalFOP');
upsertUpUser('rahasafitahiandraibe@gmail.com', 'Admin2026!', 'Fitahiandraibe', 'HASA');

// 4. Mettre à jour le mot de passe de l'admin Strapi (admin_users) pour rahasafitahiandraibe@gmail.com
const strapiAdmin = db.prepare("SELECT * FROM admin_users WHERE LOWER(email) = 'rahasafitahiandraibe@gmail.com'").get();
if (strapiAdmin) {
  const newHash = bcrypt.hashSync('Admin2026!', 10);
  db.prepare("UPDATE admin_users SET password = ?, is_active = 1, blocked = 0, updated_at = ? WHERE id = ?").run(newHash, now, strapiAdmin.id);
  console.log('[OK] Mot de passe du compte Super Admin Strapi (rahasafitahiandraibe@gmail.com) configuré avec succès !');
}

console.log('--- OPÉRATION TERMINÉE ---');
