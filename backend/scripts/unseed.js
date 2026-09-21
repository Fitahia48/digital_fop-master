/**
 * ============================================================================
 *  unseed.js — Nettoyage des données de test créées par seed.js
 * ============================================================================
 *
 *  LANCER :  cd backend && node scripts/unseed.js
 *
 *  Supprime UNIQUEMENT les lignes marquées "-TEST" / "[TEST]" / "*.test@*"
 *  (mêmes marqueurs que seed.js), dans l'ordre des clés étrangères.
 *  Les données réelles ne sont jamais touchées.
 * ============================================================================
 */

require('dotenv').config();
const pool = require('../src/config/db');

async function main() {
  console.log('=== Unseed Digital FOP — suppression des données de test ===\n');

  // Ordre FK : documents → actualites → organigramme → domaines → users
  const d1 = await pool.query("DELETE FROM documents WHERE numero LIKE '%-TEST'");
  console.log(`📄 ${d1.rowCount} document(s) de test supprimé(s).`);

  const d2 = await pool.query("DELETE FROM actualites WHERE titre LIKE '[TEST]%'");
  console.log(`📰 ${d2.rowCount} actualité(s) de test supprimée(s).`);

  const d3 = await pool.query(
    "DELETE FROM organigramme WHERE service LIKE '%[TEST]%' OR poste LIKE '%[TEST]%'"
  );
  console.log(`🏢 ${d3.rowCount} entrée(s) organigramme de test supprimée(s).`);

  const d4 = await pool.query("DELETE FROM domaines WHERE nom LIKE '%[TEST]%'");
  console.log(`📂 ${d4.rowCount} domaine(s) de test supprimé(s).`);

  const d5 = await pool.query(
    "DELETE FROM users WHERE email IN ('admin.test@mtefop.mg','user.test@mtefop.mg','noperm.test@mtefop.mg')"
  );
  console.log(`👤 ${d5.rowCount} utilisateur(s) de test supprimé(s).`);

  console.log('\n✅ Nettoyage terminé. Les données réelles sont intactes.');
}

main()
  .catch((err) => {
    console.error('\n❌ Erreur unseed :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
