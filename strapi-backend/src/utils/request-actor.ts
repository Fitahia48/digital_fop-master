/**
 * Récupération de l'acteur courant dans un contexte sans ctx direct
 * (Document Service middlewares, lifecycles).
 *
 * Source : strapi.requestContext.get() — dispo en Strapi 5.54 (vérifié dans
 * node_modules/@strapi/core/dist/Strapi.js : service `requestContext`).
 * Retourne le ctx Koa courant ou undefined hors requête (scripts, cron).
 */
export const getCurrentCtx = (): any => {
  try {
    return (strapi as any).requestContext?.get?.() ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * Acteur courant de la requête :
 * - usager connecté U&P (front) → ctx.state.user
 * - admin du panneau d'administration → ctx.state.user (strapi admin JWT) OU
 *   l'utilisateur admin attaché par la stratégie admin-auth.
 *
 * ⚠️ Les deux JWT (front U&P / panneau admin) sont distincts. Dans le panneau,
 * ctx.state.user est peuplé par la stratégie admin → `user.id` existe aussi.
 */
export const getCurrentActor = (): { id: number | null; email: string | null; isAdmin: boolean } => {
  const ctx = getCurrentCtx();
  const user = ctx?.state?.user ?? null;
  if (!user) return { id: null, email: null, isAdmin: false };
  return {
    id: user.id ?? null,
    email: user.email ?? null,
    isAdmin: Boolean(user.is_staff || user.is_superuser || user.roles?.length),
  };
};
