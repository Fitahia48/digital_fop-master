import { compileStrapi, createStrapi } from '@strapi/strapi';

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    const documents = app.db.query('api::document.document');
    const doc = await documents.findOne({
      where: { numero: '2024-055' },
    });

    if (!doc) {
      console.log('Document with numero 2024-055 not found.');
      return;
    }

    console.log(`Found document: ${doc.id}, current etat_notice: ${doc.etat_notice}`);

    if (doc.etat_notice !== 'validee') {
      await documents.update({
        where: { id: doc.id },
        data: { etat_notice: 'validee' },
      });
      console.log('Updated etat_notice to validee.');
    } else {
      console.log('Document already has etat_notice validee.');
    }
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});