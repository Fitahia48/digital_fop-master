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

    // Define updates
    const updates: any = {};

    // Update presentation_application to add validation note
    const currentPresentation = entry.presentation_application;
    const validationNote = '<p><em>[À valider par la Direction de la Communication]</em> </p>';
    // We'll prepend the validation note
    updates.presentation_application = validationNote + currentPresentation;

    // Update contact fields with placeholders
    updates.contact_email = 'contact@ministere.gov.mg';
    updates.contact_telephone = '+261 20 22 XXX XXX';
    updates.contact_adresse = 'Antananarivo, Madagascar';

    // Apply updates
    await apropos.update({
      where: { id: entry.id },
      data: updates,
    });

    console.log('APropos entry updated successfully.');
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});