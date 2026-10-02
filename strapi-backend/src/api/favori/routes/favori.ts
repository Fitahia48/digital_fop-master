import { factories } from '@strapi/strapi';

/**
 * Router favori.
 *
 * Les routes core (GET/POST/DELETE `/favoris`) entrent en collision avec les
 * routes custom legacy (mêmes chemin + méthode) définies dans favori-custom.ts.
 * On les désactive : toute la gestion des favoris passe par les routes custom
 * (ownership vérifié dans le contrôleur, forme de réponse legacy).
 */
export default factories.createCoreRouter('api::favori.favori', { only: [] });
