import { factories } from '@strapi/strapi';

/**
 * Router demarche : CRUD core RESTREINT (P2 — anti mass-assignment).
 *
 * - create/find/findOne : réécrits dans le controller (whitelist, ownership).
 * - update : utile au panneau d'administration (agent/affectation/statut) ;
 *   l'accès est contrôlé par les permissions U&P (aucune au rôle Public,
 *   rien pour Authenticated → seuls Administrateur et agents l'obtiennent).
 * - delete : NON exposé côté content-API (aucune permission cochée, même admin
 *   panneau peut le faire via l'admin UI interne).
 *
 * Les routes custom (mine, timeline, updateStatus, accuse-reception) sont
 * dans demarche-custom.ts.
 */
export default factories.createCoreRouter('api::demarche.demarche', {
  only: ['create', 'find', 'findOne', 'update'],
});
