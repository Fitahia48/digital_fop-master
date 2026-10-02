/**
 * Middleware global de comptage des visites (portage de `trackVisit`
 * de backend/src/controllers/visits.controller.js).
 *
 * La table `visits` reste HORS Strapi (D7 : tables analytiques hors
 * content-types) → insertion SQL directe via `strapi.db.connection`.
 *
 * Comme dans le legacy : seules les requêtes GET sont comptées, et on exclut
 * les endpoints de statistiques/suggestions/notes ainsi que les fichiers
 * statiques. Une erreur de tracking ne bloque JAMAIS la requête.
 */

// Fragments de chemin exclus du comptage (identiques au legacy)
const EXCLUDED_FRAGMENTS = ['visit-statistics', 'suggestions', 'app-ratings', '/media'];

// Extensions de fichiers statiques exclues
const EXCLUDED_EXTENSIONS = ['.ico', '.png', '.jpg', '.css', '.js'];

export default (_config: unknown, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    try {
      if (ctx.request.method === 'GET') {
        const path = String(ctx.request.path || '').toLowerCase();
        const excluded =
          EXCLUDED_FRAGMENTS.some((fragment) => path.includes(fragment)) ||
          EXCLUDED_EXTENSIONS.some((ext) => path.endsWith(ext));

        if (!excluded) {
          const ip = ctx.request.ip || ctx.request.socket?.remoteAddress || '0.0.0.0';
          const userAgent = ctx.request.headers['user-agent'] || '';
          const today = new Date().toISOString().split('T')[0];

          await strapi.db.connection.raw(
            'INSERT INTO visits (ip_address, user_agent, visit_date) VALUES (?, ?, ?)',
            [ip, userAgent, today]
          );
        }
      }
    } catch (err) {
      // Ne jamais bloquer la requête à cause du tracking
      console.error('Erreur tracking visite:', (err as Error).message);
    }

    await next();
  };
};
