import type { Schema, Struct } from '@strapi/strapi';

export interface LiensLien extends Struct.ComponentSchema {
  collectionName: 'components_liens_liens';
  info: {
    displayName: 'Lien';
    icon: 'link';
  };
  attributes: {
    libelle: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    url: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'liens.lien': LiensLien;
    }
  }
}
