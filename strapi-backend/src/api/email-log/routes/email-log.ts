import { factories } from '@strapi/strapi';

/**
 * Router email-log : routes core Strapi.
 * Les permissions U&P (Public / Authenticated) ne sont PAS attribuées à ce
 * type : seuls les administrateurs le lisent depuis le panneau.
 */
export default factories.createCoreRouter('api::email-log.email-log');
