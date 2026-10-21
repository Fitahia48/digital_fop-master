/**
 * Envoie un e-mail de publication D'ESSAI — AUCUN abonné réel n'est sollicité.
 *
 * Usage (depuis strapi-backend/) :
 *   npx tsc scripts/test-mail.ts --outDir .tmp-scripts --module CommonJS \
 *     --moduleResolution Node --esModuleInterop --skipLibCheck
 *   node .tmp-scripts/scripts/test-mail.js --to=adresse@exemple.test \
 *     [--lang=fr|en|mg] [--type=document|actualite] [--titre=Titre d'essai] \
 *     [--link=http://localhost:5173/documents/42] [--token=jeton-desabonnement]
 *
 * SMTP : mêmes variables que l'application (.env). Pour un essai SANS ENVOI
 * RÉEL, lancer au préalable le serveur de capture locale :
 *   node .tmp-scripts/scripts/smtp-capture.js
 *   SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_NO_AUTH=true
 *
 * Codes de sortie : 0 = envoyé, 2 = échec (ou SMTP non configuré), 1 = usage invalide.
 *
 * ⚠️ Aucune adresse d'abonné réelle ne doit être utilisée ici : la cible doit
 * être une adresse de test (ex. capture@exemple.test) ou, avec accord
 * explicite, l'adresse du responsable du projet.
 */
import path from 'path';

// Charge le .env local AVANT d'importer le mailer (lit process.env au chargement).
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
} catch {
  // dotenv absent : les variables proviennent déjà de l'environnement.
}

const USAGE = `Usage : node .tmp-scripts/scripts/test-mail.js --to=adresse@exemple.test
         [--lang=fr|en|mg] [--type=document|actualite] [--titre=...] [--link=...] [--token=...]`;

const parseArgs = (argv: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? 'true';
  }
  return out;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const to = args['to'];
  if (!to) {
    console.error(USAGE);
    process.exit(1);
  }

  const lang = (args['lang'] || 'fr').slice(0, 2);
  const type: 'document' | 'actualite' = args['type'] === 'actualite' ? 'actualite' : 'document';
  const titre = args['titre'] || "Document de test — relatif à l'Etat & aux agents (éàç)";
  const token = args['token'] || null;

  // Import différé : dotenv a déjà été exécuté ci-dessus.
  const { sendNewPublicationEmail, MAILER_ENABLED, SITE_URL, explainSmtpError } = await import(
    '../src/utils/mailer'
  );

  const lien = args['link'] || (type === 'document' ? `${SITE_URL}/documents/1` : `${SITE_URL}/#onboarding-news`);

  console.log('── Envoi d\'essai ─────────────────────────────────────────');
  console.log(`SMTP        : ${MAILER_ENABLED ? 'configuré' : 'NON configuré → affichage console seulement'}`);
  console.log(`SITE_URL    : ${SITE_URL}`);
  console.log(`Destinataire: ${to}`);
  console.log(`Langue/type : ${lang} / ${type}`);
  console.log(`Titre       : ${titre}`);
  console.log(`Lien        : ${lien}`);
  console.log(`Jeton desab.: ${token || '(aucun → lien de désabonnement = accueil, pas d\'en-tête List-Unsubscribe)'}`);
  console.log('───────────────────────────────────────────────────────────');

  const summary = await sendNewPublicationEmail(
    type,
    titre,
    lien,
    [{ email: to, unsubscribe_token: token, langue_preferee: lang }],
    lang
  );

  console.log('Résumé :', JSON.stringify(summary));
  if (summary.sent > 0) {
    console.log('✅ RÉSULTAT : envoyé — le mail doit être dans la boîte de réception OU les indésirables.');
  } else {
    console.error('❌ RÉSULTAT : NON envoyé.');
    if (!MAILER_ENABLED) {
      console.error('   → Mailer INACTIF : SMTP_USER/SMTP_PASS (ou EMAIL_USER/EMAIL_PASSWORD) absents du .env.');
      console.error('     Strapi lit strapi-backend/.env au démarrage : vérifiez le fichier puis relancez.');
    }
    // Traduit 535 / port bloqué / quota en conseil lisible (sans secret).
    summary.errors.forEach((e) => console.error(`   → Cause : ${explainSmtpError(e)}`));
  }
  process.exit(summary.sent > 0 ? 0 : 2);
}

main().catch((err) => {
  console.error('Erreur fatale :', (err as Error).message);
  process.exit(2);
});
