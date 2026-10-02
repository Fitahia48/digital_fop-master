import { ValidationError } from '../../../../utils/errors';
import { extractRelationRef, relationFilter } from '../../../../utils/relations';

export default {
  async beforeCreate(event: any) {
    const { data } = event.params || {};
    if (!data) return;

    const userRef = extractRelationRef(data.user);
    const documentRef = extractRelationRef(data.document);
    if (userRef == null || documentRef == null) return;

    const existing = (await strapi.documents('api::favori.favori').findMany({
      filters: {
        user: relationFilter(userRef),
        document: relationFilter(documentRef),
      },
      limit: 1,
    })) as any[];

    if (existing.length > 0) {
      throw new ValidationError('Ce document est déjà dans vos favoris.');
    }
  },
};
