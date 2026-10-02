/**
 * Helpers de relations pour les lifecycle hooks.
 *
 * Dans un `beforeCreate`, `event.params.data` peut contenir une relation sous
 * plusieurs formes selon l'appelant et la version de Strapi :
 *   - scalaire          : `4` (id) ou `"abc123"` (documentId)
 *   - tableau          : `[4]`
 *   - objet relationnel : `{ set: [...] }`, `{ connect: [...] }`,
 *     `{ id }` ou `{ documentId }`
 * On normalise vers une référence unique (id numérique ou documentId).
 */

/** Extrait une référence unique (id ou documentId) depuis les formes ci-dessus. */
export const extractRelationRef = (value: any): string | number | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length > 0 ? extractRelationRef(value[0]) : undefined;
  if (typeof value === 'object') {
    for (const key of ['set', 'connect', 'id', 'documentId']) {
      if (value[key] != null) return extractRelationRef(value[key]);
    }
  }
  return undefined;
};

/**
 * Construit un filtre de relation (`{ id }` ou `{ documentId }`) à partir d'une
 * référence. Les documentId Strapi sont des chaînes alphanumériques ; les ids
 * legacy sont numériques (éventuellement fournis sous forme de chaîne).
 */
export const relationFilter = (
  ref: string | number | undefined
): Record<string, unknown> | undefined => {
  if (ref == null) return undefined;
  if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
    return { id: Number(ref) };
  }
  return { documentId: ref };
};
