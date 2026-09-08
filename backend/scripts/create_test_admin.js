const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function createTestAdmin() {
  try {
    const nom = 'Test';
    const prenom = 'Admin';
    const email = 'admin@test.com';
    const password = 'Admin1234!';

    const hashedPassword = await bcrypt.hash(password, 12);

    // Supprimer si existait déjà pour réinitialiser
    await pool.query('DELETE FROM users WHERE email = $1', [email]);

    const result = await pool.query(
      `INSERT INTO users (nom, prenom, email, password, is_staff, is_superuser, is_active)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE)
       RETURNING id, nom, prenom, email, is_staff, is_superuser, is_active, date_joined`,
      [nom, prenom, email, hashedPassword]
    );

    console.log(' Nouveau compte administrateur créé avec succès :');
    console.log(result.rows[0]);
    console.log('\nIdentifiants de connexion :');
    console.log('Email      : ' + email);
    console.log('Mot de passe : ' + password);
  } catch (err) {
    console.error('Erreur :', err.message);
  } finally {
    await pool.end();
  }
}

createTestAdmin();
