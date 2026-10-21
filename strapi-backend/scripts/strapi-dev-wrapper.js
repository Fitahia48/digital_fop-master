/**
 * Wrapper de démarrage de Strapi (développement) sans Build Admin.
 *
 * Ne sort pas jusqu'à ce que le processus soit arrêté : on l'exécute en
 * arrière-plan (nohup) pour alléger le boot et garder le port libre.
 *
 * Exécution :
 *   node scripts/strapi-dev-wrapper.js \
 *     SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_NO_AUTH=true FRONTEND_URL=http://localhost:5173 \
 *     MAIL_BATCH_PAUSE_MS=500
 */
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const child = spawn('node', ['node_modules/strapi/bin/server.js', 'develop', '--no-build-admin', ...args], {
  stdio: ['ignore', 'ignore', 'ignore'],
  detached: true,
});

child.unref();
setTimeout(() => process.exit(0), 10000).unref();

// Log de compatibilité : la sortie est redirigée vers un fichier par l'appelant.
setInterval(() => {}, 60000).unref();
