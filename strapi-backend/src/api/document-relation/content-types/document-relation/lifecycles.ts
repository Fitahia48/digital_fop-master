import { ValidationError } from '../../../../utils/errors';
import { extractRelationRef, relationFilter } from '../../../../utils/relations';

export default {
  async beforeCreate(event: any) {
    const { data } = event.params || {};
    if (!data) return;

    const sourceRef = extractRelationRef(data.document_source);
    const cibleRef = extractRelationRef(data.document_cible);

    if (sourceRef != null && cibleRef != null && String(sourceRef) === String(cibleRef)) {
      throw new ValidationError('Un document ne peut pas être lié à lui-même.');
    }

    if (sourceRef != null && cibleRef != null && data.type_relation) {
      const existing = (await strapi.documents('api::document-relation.document-relation').findMany({
        filters: {
          document_source: relationFilter(sourceRef),
          document_cible: relationFilter(cibleRef),
          type_relation: data.type_relation,
        },
        limit: 1,
      })) as any[];

      if (existing.length > 0) {
        throw new ValidationError('Cette relation juridique existe déjà entre ces deux documents.');
      }
    }
  },
};
