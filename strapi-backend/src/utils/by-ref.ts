import { relationFilter } from './relations';

/**
 * Charge un document par référence « legacy » : **id numérique** (URLs du front
 * existant, ex. `/documents/12/visit/`) ou **documentId** Strapi (chaîne
 * alphanumérique). Renvoie `null` si introuvable.
 *
 * Le front React historique manipule les ids numériques, tandis que le
 * Document Service de Strapi 5 attend des `documentId` : ce helper fait le pont
 * pour tous les controllers custom qui reçoivent un `:id` de route.
 */
export const findOneByRef = async (
  uid: string,
  ref: string | number | undefined,
  populate?: string[] | string
): Promise<any | null> => {
  if (ref == null || ref === '') return null;

  const query: Record<string, unknown> = {
    filters: relationFilter(ref),
    limit: 1,
  };
  if (populate) query.populate = populate;

  const rows = (await (strapi.documents as any)(uid).findMany(query)) as any[];
  return rows[0] ?? null;
};
