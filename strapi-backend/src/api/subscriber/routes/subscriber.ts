import { factories } from '@strapi/strapi';

/**
 * Router subscriber : CRUD core Strapi.
 * Les routes custom (subscribe, confirm, unsubscribe) sont dans subscriber-custom.ts.
 */
export default factories.createCoreRouter('api::subscriber.subscriber');
