const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function migrate() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '9338',
    database: process.env.DB_NAME || 'digitallibrary_db1',
  });

  try {
    await client.connect();
    console.log('Connecté à PostgreSQL (digitallibrary_db1)');

    const sqlPath = path.join(__dirname, '..', 'migrations', 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Exécution de init.sql...');
    await client.query(sql);
    console.log('init.sql exécuté avec succès.');

    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log('Tables créées :', res.rows.map((r) => r.table_name));
  } catch (err) {
    console.error('Erreur migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
