/**
 * ============================================================================
 *  seed.js — Données de test pour Digital FOP (PostgreSQL)
 * ============================================================================
 *
 *  LANCER :    cd backend && node scripts/seed.js
 *  NETTOYER :  cd backend && node scripts/unseed.js
 *
 *  ⚠️  COMPORTEMENT (documenté, NON destructif pour les données réelles) :
 *  - Toutes les lignes insérées portent un MARQUEUR commun "-TEST" / "[TEST]"
 *    (numeros "N001-TEST", emails "*@mtefop.mg" avec ".test.", titres
 *    "[TEST] ...", service/poste "... [TEST]", domaines "... [TEST]").
 *  - À chaque exécution, le script supprime UNIQUEMENT les lignes de test
 *    précédentes (marqueurs ci-dessus) puis les réinsère → IDEMPOTENT.
 *  - Les données réelles (sans marqueur) ne sont jamais touchées.
 *  - Pour nettoyer après les tests : `node scripts/unseed.js` (supprime les
 *    mêmes marqueurs), ou manuellement :
 *      DELETE FROM documents  WHERE numero LIKE '%-TEST';
 *      DELETE FROM actualites WHERE titre LIKE '[TEST]%';
 *      DELETE FROM organigramme WHERE service LIKE '%[TEST]%' OR poste LIKE '%[TEST]%';
 *      DELETE FROM domaines   WHERE nom LIKE '%[TEST]%';
 *      DELETE FROM users      WHERE email IN ('admin.test@mtefop.mg','user.test@mtefop.mg','noperm.test@mtefop.mg');
 *
 *  ⚠️  COMPTES DE TEST — JAMAIS en production :
 *      admin.test@mtefop.mg   / TestAdmin2026!   (admin : is_staff + is_superuser)
 *      user.test@mtefop.mg    / TestUser2026!    (utilisateur standard)
 *      noperm.test@mtefop.mg  / TestNoPerm2026!  (is_staff/is_superuser = FALSE,
 *                                                 pour tester les 403 en appelant
 *                                                 l'API directement)
 *
 *  Note : les chemins de fichiers de test n'existent pas sur disque (sauf si
 *  vous déposez des PDF nommés en conséquence dans backend/media/documents/).
 *  C'est volontaire pour tester aussi l'affichage "Non disponible" et les
 *  liens legacy potentiellement cassés.
 * ============================================================================
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

// ── Utilitaires dates ────────────────────────────────────────────────────────
const today = new Date();
const daysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};
const tsDaysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

// ── Nettoyage des précédentes lignes de test (idempotence) ──────────────────
async function cleanTestRows() {
  // Ordre FK : documents → actualites → organigramme → domaines → users
  await pool.query("DELETE FROM documents WHERE numero LIKE '%-TEST'");
  await pool.query("DELETE FROM actualites WHERE titre LIKE '[TEST]%'");
  await pool.query(
    "DELETE FROM organigramme WHERE service LIKE '%[TEST]%' OR poste LIKE '%[TEST]%'"
  );
  await pool.query("DELETE FROM domaines WHERE nom LIKE '%[TEST]%'");
  await pool.query(
    "DELETE FROM users WHERE email IN ('admin.test@mtefop.mg','user.test@mtefop.mg','noperm.test@mtefop.mg')"
  );
}

async function main() {
  console.log('=== Seed Digital FOP — données de test (marqueur "-TEST") ===\n');

  await cleanTestRows();
  console.log('🧹 Anciennes lignes de test supprimées (idempotence).\n');

  // ── 1. UTILISATEURS ────────────────────────────────────────────────────────
  const users = [
    // [nom, prenom, email, password, is_staff, is_superuser]
    ['Admin', 'Test', 'admin.test@mtefop.mg', 'TestAdmin2026!', true, true],
    ['User', 'Test', 'user.test@mtefop.mg', 'TestUser2026!', false, false],
    ['NoPerm', 'Test', 'noperm.test@mtefop.mg', 'TestNoPerm2026!', false, false],
  ];
  let adminId = null;
  for (const [nom, prenom, email, plain, staff, superu] of users) {
    const hash = await bcrypt.hash(plain, 12); // même système que create_admin.js
    const r = await pool.query(
      `INSERT INTO users (nom, prenom, email, password, is_staff, is_superuser, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id`,
      [nom, prenom, email, hash, staff, superu]
    );
    if (email === 'admin.test@mtefop.mg') adminId = r.rows[0].id;
  }
  console.log('👤 3 utilisateurs de test créés (is_active=TRUE, pas de mail requis).');

  // ── 2. DOMAINES (pour le filtre "Accès par thème") ─────────────────────────
  const domaines = ['Droit du travail [TEST]', 'Fonction publique [TEST]', 'Sécurité sociale [TEST]'];
  const domaineIds = [];
  for (const nom of domaines) {
    const r = await pool.query('INSERT INTO domaines (nom) VALUES ($1) RETURNING id', [nom]);
    domaineIds.push(r.rows[0].id);
  }
  console.log('📂 3 domaines de test créés.');

  // ── 3. DOCUMENTS (15) ──────────────────────────────────────────────────────
  // Colonnes testées :
  //  - objet      : mots-clés variés (recherche par objet)
  //  - type       : 6 valeurs réelles du formulaire (recherche par type)
  //  - numero     : N001/N002/N003-TEST (recherche par numéro seul)
  //  - date       : 4 récentes (<30j) + anciennes >6 mois (plage de dates)
  //  - journal    : 2 documents avec JO complet (recherche combinée)
  //  - fichier    : format actuel "documents/x.pdf" + legacy "/media/..." et "media/..."
  //  - audit      : last_modified_* sur 8/15, NULL sur les autres
  const docs = [
    // [objet, type, numero, date, conseil, domaineIdx|null, fichier, status, inclus_journal, date_journal, numero_journal, page_journal, modified?]
    ['Décret portant organisation du ministère du Travail [TEST organisation]', 'Ordonnances', 'N001-TEST', daysAgo(5), 'gouvernement', 0, 'documents/TEST-decret-organisation.pdf', 'En vigueur', false, null, null, null, 2],
    ['Loi sur le dialogue social au sein des entreprises [TEST dialogue]', 'Lois ordinaires', 'N002-TEST', daysAgo(20), 'ministre', 0, '/media/documents/TEST-dialogue-social.pdf', 'En vigueur', false, null, null, null, 10],
    ['Convention collective du secteur textile à Madagascar [TEST textile]', 'Convention', 'N003-TEST', daysAgo(45), 'Autre', 0, 'media/documents/TEST-textile.pdf', 'En vigueur', false, null, null, null, null],
    ['Constitution de la République de Madagascar [TEST constitution]', 'Constitution', 'CONST-TEST', daysAgo(365), 'Autre', 1, null, 'En vigueur', false, null, null, null, null],
    ['Accord de libre-échange régional [TEST commerce]', 'Traités internationaux', 'TR-TEST', daysAgo(200), 'Autre', null, 'documents/TEST-libre-echange.pdf', 'En vigueur', false, null, null, null, 30],
    ['Loi organique relative à la Cour des comptes [TEST cour]', 'Lois organiques', 'LO-TEST', daysAgo(90), 'Autre', 1, null, 'Abrogé', false, null, null, null, 60],
    ['Ordonnance portant recodification du code du travail [TEST recodif]', 'Ordonnances', 'N004-TEST', daysAgo(150), 'gouvernement', 0, 'documents/TEST-recodification.pdf', 'En vigueur', false, null, null, null, null],
    ["Loi portant création du fonds national de l'emploi [TEST emploi]", 'Lois ordinaires', 'N005-TEST', daysAgo(30), 'ministre', 0, '/media/documents/TEST-fne.pdf', 'En vigueur', false, null, null, null, 5],
    ['Convention sur la sécurité sociale des travailleurs migrants [TEST migrants]', 'Convention', 'N006-TEST', daysAgo(75), 'Autre', 2, null, 'En vigueur', false, null, null, null, null],
    ['Loi organique sur les lois de finances [TEST lof]', 'Lois organiques', 'LOF-TEST', daysAgo(110), 'Autre', null, 'documents/TEST-lof.pdf', 'Abrogé', false, null, null, null, 90],
    // Journal Officiel #1 (recherche combinée date + numéro)
    ['Décret fixant les modalités du Conseil du Gouvernement [TEST journal-A]', 'Ordonnances', 'J-A-TEST', daysAgo(60), 'gouvernement', 1, 'documents/TEST-jo-a.pdf', 'En vigueur', true, daysAgo(55), 'JO-12345', '1023', 40],
    // Journal Officiel #2
    ["Loi portant approbation de l'ordonnance budgétaire [TEST journal-B]", 'Lois ordinaires', 'J-B-TEST', daysAgo(40), 'Autre', 1, '/media/documents/TEST-jo-b.pdf', 'En vigueur', true, daysAgo(35), 'JO-12350', '2045', null],
    ["Accord bilatéral de main-d'œuvre avec l'île Maurice [TEST maurice]", 'Traités internationaux', 'TR-MU-TEST', daysAgo(15), 'Autre', null, null, 'En vigueur', false, null, null, null, null],
    ["Ordonnance sur l'inspection du travail [TEST inspection]", 'Ordonnances', 'N007-TEST', daysAgo(7), 'ministre', 0, 'documents/TEST-inspection.pdf', 'En vigueur', false, null, null, null, 1],
    ['Constitution — amendement de 2026 [TEST amendement]', 'Constitution', 'CONST2-TEST', daysAgo(3), 'Autre', 1, '/media/documents/TEST-amendement.pdf', 'En vigueur', false, null, null, null, null],
  ];

  for (const [objet, type, numero, date, conseil, domIdx, fichier, status, inj, dj, nj, pj, modifiedDaysAgo] of docs) {
    await pool.query(
      `INSERT INTO documents
         (type, objet, numero, date, conseil, domaine_id, fichier, pdf_file, status,
          inclus_journal, date_journal, numero_journal, page_journal,
          last_modified_by, last_modified_at, modification_details,
          visits, telechargements)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        type, objet, numero, date, conseil,
        domIdx === null ? null : domaineIds[domIdx],
        fichier, status,
        inj, dj, nj, pj,
        modifiedDaysAgo === null ? null : adminId,
        modifiedDaysAgo === null ? null : tsDaysAgo(modifiedDaysAgo),
        modifiedDaysAgo === null ? null : `Modification de test effectuée il y a ${modifiedDaysAgo} jour(s)`,
        Math.floor(Math.random() * 50), // visits
        Math.floor(Math.random() * 20), // telechargements
      ]
    );
  }
  console.log(`📄 ${docs.length} documents de test insérés.`);

  // ── 4. ACTUALITES ──────────────────────────────────────────────────────────
  const actus = [
    // [conseil, titre, date, lieu, texte, categorie]
    ['CONSEIL DES MINISTRES', '[TEST] Conseil des Ministres — réunion hebdomadaire', daysAgo(3), 'Ambatobe', "Texte de test pour vérifier l'affichage groupé par conseil.", 'actualite'],
    ['CONSEIL DES MINISTRES', '[TEST] Conseil des Ministres — adoption de décrets', daysAgo(10), 'Iavoloha', 'Deuxième actualité de test du Conseil des Ministres.', 'actualite'],
    ['CONSEIL DU GOUVERNEMENT', '[TEST] Conseil du Gouvernement — bilan économique', daysAgo(5), 'Anosikely', "Texte de test pour l'affichage groupé côté Gouvernement.", 'actualite'],
    ['CONSEIL DU GOUVERNEMENT', '[TEST] Conseil du Gouvernement — projet de loi emploi', daysAgo(14), 'Antananarivo', 'Deuxième actualité de test du Conseil du Gouvernement.', 'actualite'],
    // Bonus : pour tester les nouvelles catégories (Fix 4)
    ['CONSEIL DES MINISTRES', '[TEST] Offre — Recrutement de 5 inspecteurs du travail', daysAgo(2), 'Antananarivo', 'Offre de test affichée dans la section "Offres du MTeFOP".', 'offre'],
    ['CONSEIL DU GOUVERNEMENT', '[TEST] Nouveauté — Mise en ligne du portail organigramme', daysAgo(1), 'Antananarivo', 'Nouveauté de test affichée dans la section "Nouveautés".', 'nouveaute'],
  ];
  for (const [conseil, titre, date, lieu, texte, categorie] of actus) {
    await pool.query(
      `INSERT INTO actualites (conseil, titre, date, lieu, texte, categorie)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [conseil, titre, date, lieu, texte, categorie]
    );
  }
  console.log(`📰 ${actus.length} actualités de test insérées (4 conseils + 1 offre + 1 nouveauté).`);

  // ── 5. ORGANIGRAMME (parent_id NULL → liste groupée par service) ───────────
  const orgas = [
    ['RAKOTO Andry', 'Directeur Général [TEST]', 'Direction Générale [TEST]'],
    ['RASOA Hanta', 'Directeur Adjoints [TEST]', 'Direction Générale [TEST]'],
    ['RABE Tovo', 'Chef de service DEAJ [TEST]', 'DEAJ [TEST]'],
    ['RANDRIA Nirina', 'Conseiller technique [TEST]', 'Cabinet [TEST]'],
  ];
  for (const [nom, poste, service] of orgas) {
    await pool.query(
      `INSERT INTO organigramme (nom, poste, service, parent_id, ordre, actif)
       VALUES ($1,$2,$3,NULL,0,TRUE)`,
      [nom, poste, service]
    );
  }
  console.log(`🏢 ${orgas.length} entrées organigramme de test insérées.`);

  // ── Récapitulatif ──────────────────────────────────────────────────────────
  console.log(`
=== ✅ Seed terminé ===

Comptes de test (is_active = TRUE, connexion immédiate) :
  • admin.test@mtefop.mg   / TestAdmin2026!    → admin (boutons CRUD, historique)
  • user.test@mtefop.mg    / TestUser2026!     → standard
  • noperm.test@mtefop.mg  / TestNoPerm2026!   → non-admin (test 403 via API directe)

Tests rapides :
  1. Objet      → chercher "dialogue", "textile", "organisation"
  2. Type       → filtrer "Constitution", "Ordonnances", "Convention"
  3. Numéro     → chercher "N001-TEST", "N002-TEST", "N003-TEST"
  4. Plage      → de (aujourd'hui - 30j) à aujourd'hui → 4 docs récents
                  de -200j à -100j → docs anciens
  5. Journal    → date_journal = -55j + numéro = "JO-12345" → 1 doc
  6. Fichiers   → docs 1/5/7/11/14 : liens valides si PDF présents ;
                  docs 2/8/12/15 : chemins legacy ("/media/...", "media/...")
  7. Historique → info de modification sur 8 docs (icône ⓘ admin uniquement)

Nettoyage : node scripts/unseed.js
`);
}

main()
  .catch((err) => {
    console.error('\n❌ Erreur seed :', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
