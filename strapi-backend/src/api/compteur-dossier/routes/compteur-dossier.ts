import { factories } from '@strapi/strapi';

/**
 * Aucune route content-API : le compteur est manipulé uniquement par
 * utils/numero-dossier.ts (upsert SQL atomique). Ne jamais exposer.
 */
export default factories.createCoreRouter('api::compteur-dossier.compteur-dossier', {
  only: [],
});
