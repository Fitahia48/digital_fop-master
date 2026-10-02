/**
 * Helpers d'erreurs HTTP pour les controllers custom.
 * Les classes viennent de @strapi/utils (formatées par le middleware strapi::errors).
 */
import { errors } from '@strapi/utils';

export const {
  ApplicationError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  UnauthorizedError,
} = errors;

/** Extraire l'usager U&P éventuellement attaché à la requête par la stratégie users-permissions. */
export const getRequestUser = (ctx: any): any | null => ctx?.state?.user ?? null;

/**
 * L'usager de la requête a-t-il le rôle Administrateur custom ?
 *
 * Le rôle « Administrateur » est un rôle U&P créé par `migrate-users.ts` :
 * selon la version de Strapi, son champ `type` peut rester vide → on teste donc
 * aussi le nom du rôle (insensible à la casse), en plus des marqueurs legacy
 * `is_staff` / `is_superuser`.
 */
export const isAdminUser = (user: any): boolean => {
  if (!user) return false;
  const role = user.role;
  const typeName = typeof role === 'object' && role !== null ? role.type : role;
  const roleName = typeof role === 'object' && role !== null ? role.name : undefined;
  return (
    typeName === 'administrateur' ||
    (typeof roleName === 'string' && roleName.trim().toLowerCase() === 'administrateur') ||
    user.is_staff === true ||
    user.is_superuser === true
  );
};
