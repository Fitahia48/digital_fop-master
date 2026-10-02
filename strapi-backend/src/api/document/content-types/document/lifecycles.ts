import { sendNewPublicationEmail } from '../../../../utils/mailer';

export default {
  async afterCreate(event: any) {
    const { result } = event;
    if (result && result.objet) {
      try {
        const subscribers = (await strapi.documents('api::subscriber.subscriber').findMany({
          filters: { is_confirmed: true },
          fields: ['email', 'unsubscribe_token', 'langue_preferee'],
          limit: -1,
        })) as any[];

        if (subscribers.length > 0) {
          sendNewPublicationEmail('document', result.objet, null, subscribers).catch((err: any) =>
            console.error('Document publication email error:', err.message)
          );
        }
      } catch (err: any) {
        console.error('Failed to notify subscribers on document creation:', err.message);
      }
    }
  },
};
