import { factories } from '@strapi/strapi';

/**
 * Aucune route content-API : le référentiel des directions se gère dans le
 * panneau d'administration (D2) et sert aux relations/routage serveur.
 */
export default factories.createCoreRouter('api::direction.direction', {
  only: [],
});
