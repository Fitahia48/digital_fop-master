/**
 * Utilitaires du module d'auth compat (URLs legacy /api/v1/auth/*).
 *
 * La délégation au plugin Users & Permissions passe par ses services internes
 * (user.validatePassword, sessionManager('users-permissions')), comme le font
 * les contrôleurs du plugin eux-mêmes.
 */

/** Forme legacy du profil usager (colonnes SQL historiques + is_staff/is_superuser dérivés du rôle). */
export const legacyUserProfile = (user: any) => {
  const role = user?.role;
  const roleName = typeof role === 'object' && role !== null ? role.name : undefined;
  const isAdmin =
    (typeof roleName === 'string' && roleName.trim().toLowerCase() === 'administrateur') ||
    user?.is_staff === true ||
    user?.is_superuser === true;
  return {
    id: user.id,
    nom: user.nom ?? null,
    prenom: user.prenom ?? null,
    email: user.email,
    is_staff: isAdmin,
    is_superuser: isAdmin,
    is_active: user.confirmed !== false && user.blocked !== true,
    langue_preferee: user.langue_preferee ?? 'fr',
    date_joined: user.createdAt ?? null,
  };
};

/**
 * Extrait l'usager authentifié du Bearer access token.
 *
 * Deux sources, dans l'ordre :
 *  1. `ctx.state.user` — renseigné par la stratégie users-permissions sur les
 *     routes Strapi natives.
 *  2. Le service `jwt` officiel du plugin, appliqué directement à la requête.
 *     Indispensable pour les routes de ce module déclarées `auth: false` : la
 *     stratégie n'y est jamais exécutée, donc `ctx.state.user` reste vide et
 *     `/v1/auth/users/me` répondrait 401 même avec un access token valide
 *     (signature OK, `type === 'access'`), comme après un simple refresh.
 *
 * Repli historique : un refresh token passé dans le body ({ refresh } ou
 * { refreshToken }) — l'ancien front envoyait le refresh token en body.
 */
export const resolveUserFromCtx = async (ctx: any): Promise<any | null> => {
  const loadById = async (id: any) => {
    if (id === undefined || id === null || id === '') return null;
    return strapi.db.query('plugin::users-permissions.user').findOne({
      where: { id },
      populate: ['role'],
    });
  };

  // Un compte bloqué est rejeté par la stratégie U&P : on reste cohérent.
  const rejectBlocked = (user: any) => (user?.blocked === true ? null : user);

  const direct = ctx?.state?.user;
  if (direct?.id) {
    return rejectBlocked(await loadById(direct.id));
  }

  try {
    const verified = await strapi.plugin('users-permissions').service('jwt').getToken(ctx);
    if (verified?.id !== undefined) {
      return rejectBlocked(await loadById(verified.id));
    }
  } catch {
    // En-tête absent ou token invalide : on tente le repli ci-dessous.
  }

  const body = ctx?.request?.body || {};
  const refreshToken = body.refresh || body.refreshToken;
  if (!refreshToken || typeof refreshToken !== 'string') return null;

  const validation = await strapi
    .sessionManager('users-permissions')
    .validateRefreshToken(refreshToken);
  if (!validation?.isValid) return null;

  return rejectBlocked(await loadById(validation.userId));
};
