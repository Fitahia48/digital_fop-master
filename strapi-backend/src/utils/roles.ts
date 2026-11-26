/**
 * Rôles d'administration — contrôle unique côté serveur.
 *
 * Deux rôles U&P :
 *   - « Administrateur »      (type `administrateur`)  → droits d'administration ;
 *   - « Super-administrateur » (type `super_admin`)     → + gestion des comptes.
 *
 * Pourquoi ce fichier existe : statistics.ts, transparence.ts et track-visit.ts
 * appelaient `strapi.plugin('users-permissions').service('user').isAdmin(user)`.
 * Cette méthode **n'existe pas** dans le plugin Users & Permissions (vérifié
 * dans node_modules/@strapi/plugin-users-permissions) → `TypeError: ...isAdmin
 * is not a function`. Dans statistics.ts et transparence.ts l'appel était hors
 * du `try/catch` du handler → 500 « Internal Server Error » sur
 * /api/visit-statistics, /api/statistics/visit-statistics et
 * /api/transparence/stats (dans track-visit.ts l'erreur était avalée, si bien
 * que les visites d'un admin étaient comptées comme celles d'un visiteur).
 *
 * Règle retenue : identique à celle qui alimente `is_staff`/`is_superuser` de
 * `/api/v1/auth/users/me/` (api/auth-compat/utils/legacy.ts), afin que le front
 * et le back ne divergent jamais.
 *
 * Ces fonctions ne lèvent jamais : en cas de doute on répond « pas admin »
 * (au pire un 403 explicite, jamais un 500).
 */

const UP_USER_UID = 'plugin::users-permissions.user';

/** Nom du rôle U&P qui ouvre les droits d'administration (role.name / role.type). */
const ADMIN_ROLE_NAMES = ['administrateur', 'admin'];

/** Rôle U&P réservé à la gestion des comptes administrateurs. */
const SUPER_ADMIN_ROLE_NAMES = ['super_admin', 'super-administrateur'];

const roleNameOf = (role: any): string | null => {
  if (typeof role === 'string') return role.trim().toLowerCase();
  if (role && typeof role === 'object') {
    const value = role.type ?? role.name;
    return typeof value === 'string' ? value.trim().toLowerCase() : null;
  }
  return null;
};

/** `true` si l'usager (rôle peuplé si disponible) est administrateur ou super-administrateur. */
export const isAdminUser = (user: any): boolean => {
  if (!user) return false;
  const roleName = roleNameOf(user.role);
  if (roleName && [...ADMIN_ROLE_NAMES, ...SUPER_ADMIN_ROLE_NAMES].includes(roleName)) {
    return true;
  }
  // Repli : colonnes legacy présentes sur certains profils migrés.
  return user.is_staff === true || user.is_superuser === true;
};

/** `true` si l'usager détient le rôle « Super-administrateur ». */
export const isSuperAdminUser = (user: any): boolean => {
  if (!user) return false;
  const roleName = roleNameOf(user.role);
  if (roleName && SUPER_ADMIN_ROLE_NAMES.includes(roleName)) return true;
  // Repli : marqueur explicite porté par le profil legacy.
  return user.is_superadmin === true;
};

/** Charge l'usager U&P (rôle peuplé) par identifiant. */
export const loadUpUser = async (id: any): Promise<any | null> => {
  if (id === undefined || id === null || id === '') return null;
  try {
    return await strapi.db.query(UP_USER_UID).findOne({
      where: { id },
      populate: ['role'],
    });
  } catch {
    return null;
  }
};

/** `true` si l'usager identifié par `id` est administrateur. */
export const isAdminUserId = async (id: any): Promise<boolean> => isAdminUser(await loadUpUser(id));

/** `true` si l'usager identifié par `id` est super-administrateur. */
export const isSuperAdminUserId = async (id: any): Promise<boolean> =>
  isSuperAdminUser(await loadUpUser(id));

/**
 * `true` si l'usager connecté du contexte Koa (ctx.state.user) est administrateur
 * ET n'a plus de mot de passe provisoire à changer.
 *
 * Tant que `doit_changer_mot_de_passe` est vrai, l'accès est limité au profil :
 * tous les endpoints qui passent par ce contrôle (abonnés, thèmes, statistiques,
 * documents, gestion des comptes…) répondent 403. Les endpoints de profil, eux,
 * ne passent pas par ici et restent donc accessibles.
 */
export const isAdminCtx = async (ctx: any): Promise<boolean> => {
  const user = await loadUpUser(ctx?.state?.user?.id);
  if (!isAdminUser(user)) return false;
  return user.doit_changer_mot_de_passe !== true;
};

/** `true` si l'usager connecté du contexte est super-administrateur (mot de passe à jour). */
export const isSuperAdminCtx = async (ctx: any): Promise<boolean> => {
  const user = await loadUpUser(ctx?.state?.user?.id);
  if (!isSuperAdminUser(user)) return false;
  return user.doit_changer_mot_de_passe !== true;
};

export default {
  isAdminUser,
  isSuperAdminUser,
  loadUpUser,
  isAdminUserId,
  isSuperAdminUserId,
  isAdminCtx,
  isSuperAdminCtx,
};
