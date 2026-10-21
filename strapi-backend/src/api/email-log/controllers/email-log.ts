/**
 * Controller email-log : CRUD core uniquement.
 *
 * Aucun accès public : le rôle Public/Authenticated ne dispose d'aucune
 * permission sur ce content-type (assign-permissions.ts ne l'attribue pas),
 * seule l'interface d'administration (Content Manager) y accède — conformément
 * à la décision « historique visible seulement des admins ».
 */
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::email-log.email-log');
