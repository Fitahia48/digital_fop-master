import { factories } from '@strapi/strapi';

/**
 * Router document : CRUD core Strapi.
 * Les routes custom (visit, telechargement, stats, suggestions, updateStatus)
 * sont dans document-custom.ts.
 */
export default factories.createCoreRouter('api::document.document');
