import { compileStrapi, createStrapi } from '@strapi/strapi';

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    const documents = app.db.query('api::document.document');
    const docs = await documents.findMany({
      limit: 10,
    });

    console.log(`Found ${docs.length} documents:`);
    for (const doc of docs) {
      console.log(`  ID: ${doc.id}, numero: '${doc.numero}', etat_notice: '${doc.etat_notice}'`);
    }
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});