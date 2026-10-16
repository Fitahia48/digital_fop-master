import { compileStrapi, createStrapi } from '@strapi/strapi';

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    const apropos = app.db.query('api::a-propos.a-propos');
    const entry = await apropos.findOne({
      where: { locale: 'fr' },
    });

    if (!entry) {
      console.log('APropos entry not found for locale fr.');
      return;
    }

    console.log(`Found APropos entry: ${entry.id}`);
    console.log('presentation_application:', entry.presentation_application);
    console.log('mission:', entry.mission);
    console.log('titre:', entry.titre);
    console.log('document_legal:', entry.document_legal);
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});