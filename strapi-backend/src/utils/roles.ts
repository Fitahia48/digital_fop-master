/**
 * Rôle « Administrateur » — contrôle unique côté serveur.
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
 * et le back ne divergent jamais : le rôle de l'usager s'appelle
 * « Administrateur » (rôle U&P créé par migrate-users.ts).
 *
 * Ces fonctions ne lèvent jamais : en cas de doute on répond « pas admin »
 * (au pire un 403 explicite, jamais un 500).
 */

/** Nom du rôle U&P qui ouvre les droits d'administration (role.name / role.type). */
const ADMIN_ROLE_NAMES = ['administrateur', 'admin'];

/** `true` si l'usager (rôle peuplé si disponible) est administrateur. */
export const isAdminUser = (user: any): boolean => {
  if (!user) return false;
  const role = user.role;
  const roleName = typeof role === 'object' && role !== null ? role.name ?? role.type : role;
  if (typeof roleName === 'string' && ADMIN_ROLE_NAMES.includes(roleName.trim().toLowerCase())) {
    return true;
  }
  // Repli : colonnes legacy présentes sur certains profils migrés.
  return user.is_staff === true || user.is_superuser === true;
};

/** Charge l'usager U&P (rôle peuplé) puis applique `isAdminUser`. */
export const isAdminUserId = async (id: any): Promise<boolean> => {
  if (id === undefined || id === null || id === '') return false;
  try {
    const user = await strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: ['role'],
    });
    return isAdminUser(user);
  } catch {
    return false;
  }
};

/** `true` si l'usager connecté du contexte Koa (ctx.state.user) est administrateur. */
export const isAdminCtx = async (ctx: any): Promise<boolean> => isAdminUserId(ctx?.state?.user?.id);

export default { isAdminUser, isAdminUserId, isAdminCtx };
