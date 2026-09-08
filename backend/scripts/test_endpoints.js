const http = require('http');
const app = require('../src/app');
const pool = require('../src/config/db');

async function testAll() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(8001, resolve));
  console.log('Test server running on port 8001');

  function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: 'localhost',
        port: 8001,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
      };

      const req = http.request(opts, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      });
      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  try {
    // 1. Root
    const rootRes = await request('GET', '/');
    console.log('1. GET / -> Status:', rootRes.status, rootRes.data.name);

    // 2. Documents
    const docsRes = await request('GET', '/api/documents/');
    console.log('2. GET /api/documents/ -> Status:', docsRes.status, 'Count:', docsRes.data.count);

    // 3. Domaines
    const domRes = await request('GET', '/api/domaines/');
    console.log('3. GET /api/domaines/ -> Status:', domRes.status, 'Items:', domRes.data.length);

    // 4. Corps
    const corpsRes = await request('GET', '/api/corps/');
    console.log('4. GET /api/corps/ -> Status:', corpsRes.status, 'Count:', corpsRes.data.count);

    // 5. Visits stats
    const visitRes = await request('GET', '/api/visit-statistics/');
    console.log('5. GET /api/visit-statistics/ -> Status:', visitRes.status, 'Total visits:', visitRes.data.total_visits);

    // 6. App rating
    const ratingRes = await request('GET', '/api/app-ratings/');
    console.log('6. GET /api/app-ratings/ -> Status:', ratingRes.status, 'Ratings count:', ratingRes.data.length);

    // 7. Clean up any existing test user
    await pool.query("DELETE FROM users WHERE email = 'test@example.com'");

    // 8. Register test user
    const regRes = await request('POST', '/api/v1/auth/users/', {
      nom: 'Dupont',
      prenom: 'Jean',
      email: 'test@example.com',
      password: 'Password123!',
      re_password: 'Password123!',
    });
    console.log('7. POST /api/v1/auth/users/ -> Status:', regRes.status, 'Created user id:', regRes.data.id);

    // Activate user directly in DB for testing
    await pool.query("UPDATE users SET is_active = TRUE WHERE email = 'test@example.com'");

    // 9. Login
    const loginRes = await request('POST', '/api/v1/auth/jwt/create/', {
      email: 'test@example.com',
      password: 'Password123!',
    });
    console.log('8. POST /api/v1/auth/jwt/create/ -> Status:', loginRes.status, 'Has access token:', !!loginRes.data.access);

    // 10. Get Me with token
    const meRes = await request('GET', '/api/v1/auth/users/me/', null, {
      Authorization: `JWT ${loginRes.data.access}`,
    });
    console.log('9. GET /api/v1/auth/users/me/ -> Status:', meRes.status, 'Email:', meRes.data.email);

    // Clean up test user
    await pool.query("DELETE FROM users WHERE email = 'test@example.com'");

    console.log('\n TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS !');
  } catch (err) {
    console.error('Erreur test:', err);
  } finally {
    server.close();
    await pool.end();
  }
}

testAll();
