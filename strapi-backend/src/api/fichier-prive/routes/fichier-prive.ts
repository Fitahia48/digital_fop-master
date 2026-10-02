import { factories } from '@strapi/strapi';

/**
 * Aucune route content-API : ce content-type n'est manipulé que par le
 * service `private-files` (décision D1). Le router est volontairement vide.
 */
export default factories.createCoreRouter('api::fichier-prive.fichier-prive', {
  only: [],
});
