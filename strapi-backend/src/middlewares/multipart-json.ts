/**
 * Parse les champs texte d'un corps multipart/form-data en JSON.
 *
 * Le middleware `strapi::body` de Strapi 5 remplit `ctx.request.body` pour le
 * multipart, mais les champs texte y arrivent en chaînes brutes : le front
 * sérialise `donnees_specifiques` (JSON) dans un champ FormData → il faut le
 * re-parser pour que le controller reçoive un objet. Les fichiers restent
 * dans `ctx.request.files` et ne sont pas touchés.
 */
import type { Core } from '@strapi/strapi';

const tryParse = (value: string): any => {
  const s = value.trim();
  if (!s.startsWith('{') && !s.startsWith('[') && !s.startsWith('"')) return value;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
};

export default (config: any, { strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    if (ctx.is('multipart/form-data') && ctx.method !== 'GET') {
      const body: Record<string, any> = {};
      for (const [key, value] of Object.entries(ctx.request.body || {})) {
        if (typeof value === 'string') {
          body[key] = tryParse(value);
        } else if (Array.isArray(value)) {
          body[key] = value.map((v) => (typeof v === 'string' ? tryParse(v) : v));
        } else {
          body[key] = value; // déjà objet (ou champ binaire inattendu)
        }
      }
      ctx.request.body = body;
    }
    await next();
  };
};
