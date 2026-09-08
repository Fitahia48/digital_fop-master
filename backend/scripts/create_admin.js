const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function createAdmin() {
  console.log('=== Création d\'un compte administrateur Digital FOP ===\n');

  try {
    const nom = (await question('Nom [Admin] : ')).trim() || 'Admin';
    const prenom = (await question('Prénom [Super] : ')).trim() || 'Super';
    const email = (await question('Email [admin@digitalfop.mg] : ')).trim() || 'admin@digitalfop.mg';
    const password = (await question('Mot de passe [Admin1234!] : ')).trim() || 'Admin1234!';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`\nUn utilisateur avec l'email "${email}" existe déjà.`);
      const update = (await question('Voulez-vous le promouvoir super-administrateur ? (o/n) : ')).trim().toLowerCase();
      if (update === 'o' || update === 'oui' || update === 'y') {
        const hash = await bcrypt.hash(password, 12);
        await pool.query(
          'UPDATE users SET password = $1, is_staff = TRUE, is_superuser = TRUE, is_active = TRUE WHERE email = $2',
          [hash, email]
        );
        console.log(`\nUtilisateur "${email}" mis à jour en tant que super-administrateur.`);
      }
    } else {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO users (nom, prenom, email, password, is_staff, is_superuser, is_active)
         VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE)`,
        [nom, prenom, email, hash]
      );
      console.log(`\nSuper-administrateur "${email}" créé avec succès !`);
    }
  } catch (err) {
    console.error('\nErreur lors de la création:', err.message);
  } finally {
    rl.close();
    await pool.end();
  }
}

createAdmin();
