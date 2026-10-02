import { sendNewPublicationEmail } from '../../../../utils/mailer';

export default {
  async afterCreate(event: any) {
    const { result } = event;
    if (result && result.titre) {
      try {
        const subscribers = (await strapi.documents('api::subscriber.subscriber').findMany({
          filters: { is_confirmed: true },
          fields: ['email', 'unsubscribe_token', 'langue_preferee'],
          limit: -1,
        })) as any[];

        if (subscribers.length > 0) {
          sendNewPublicationEmail('actualite', result.titre, null, subscribers).catch((err: any) =>
            console.error('Actualite publication email error:', err.message)
          );
        }
      } catch (err: any) {
        console.error('Failed to notify subscribers on actualite creation:', err.message);
      }
    }
  },
};
