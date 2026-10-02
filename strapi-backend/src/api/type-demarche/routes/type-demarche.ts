import { factories } from '@strapi/strapi';

/**
 * Aucun CRUD core content-API : le référentiel se gère dans le panneau
 * d'administration (D2). La route publique listActive est dans
 * routes/type-demarche-custom.ts.
 */
export default factories.createCoreRouter('api::type-demarche.type-demarche', {
  only: [],
});
