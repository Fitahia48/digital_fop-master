import { factories } from '@strapi/strapi';

/**
 * Router corps : CRUD core Strapi.
 * Pluriel retenu : « organismes » (contrainte Strapi singularName ≠ pluralName, cf. MIGRATION.md 3d).
 * Les routes custom (filter, visit, stats…) sont dans corps-custom.ts.
 */
export default factories.createCoreRouter('api::corps.corps');
