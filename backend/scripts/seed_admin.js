const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function seedAdmin() {
  try {
    const hash = await bcrypt.hash('Admin1234!', 12);
    const res = await pool.query(
      `INSERT INTO users (nom, prenom, email, password, is_staff, is_superuser, is_active)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET password = $4, is_staff = TRUE, is_superuser = TRUE, is_active = TRUE
       RETURNING id, nom, prenom, email, is_superuser`,
      ['Admin', 'Super', 'admin@digitalfop.mg', hash]
    );
    console.log('Compte administrateur initial configuré avec succès :');
    console.log(res.rows[0]);
  } catch (err) {
    console.error('Erreur seed admin:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();
