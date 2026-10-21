/**
 * Middleware « présence en ligne » (temps réel, tableau de bord admin).
 *
 * HISTORIQUE : ce middleware comptait les visites sur CHAQUE GET public
 * (`daily_stats.total_visits` + `visitor_daily`). Ce comptage a été déplacé :
 *
 *  - visites de l'application → **POST /api/visites/ping** (1 appel au montage
 *    de l'app) — un visiteur n'est compté qu'UNE fois par jour, voir
 *    src/api/visites + src/utils/comptage.ts ;
 *  - consultations de textes/corps → POST /api/documents/:id/visit et
 *    POST /api/corps/:id/visit (1 par visiteur, par texte, par jour).
 *
 * Il ne reste ici que la présence « en ligne » (upsert de
 * `visitor_presence.last_seen_at`), sans aucune IP en clair : l'identifiant est
 * l'empreinte anonyme du jour (utils/visitor-id.ts, HMAC + jour malgache).
 * Une erreur de tracking ne bloque JAMAIS la requête.
 */
import { resolveUserFromCtx } from '../api/auth-compat/utils/legacy';
import { PRESENCE_RETENTION_SECONDES } from '../utils/analytics';
import { isAdminUser } from '../utils/roles';
import { estCheminSante, estRobot, jourCourant, visiteurHash } from '../utils/visitor-id';

// Fragments de chemin exclus (statistiques/notifications/médias : ce ne sont
// pas des pages vues par un visiteur).
const EXCLUDED_FRAGMENTS = ['visit-statistics', 'suggestions', 'app-ratings', '/media'];

// Extensions de fichiers statiques exclus
const EXCLUDED_EXTENSIONS = ['.ico', '.png', '.jpg', '.jpeg', '.css', '.js', '.svg', '.webp'];

export default (_config: unknown, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    try {
      if (ctx.request.method === 'GET') {
        const path = String(ctx.request.path || '').toLowerCase();
        const excluded =
          EXCLUDED_FRAGMENTS.some((fragment) => path.includes(fragment)) ||
          EXCLUDED_EXTENSIONS.some((ext) => path.endsWith(ext));

        // Un middleware global s'exécute AVANT la stratégie d'auth de la
        // route → l'admin est résolu depuis son Bearer (même helper que le
        // module auth-compat) : ses requêtes ne font pas « présence ».
        const isAdmin = isAdminUser(await resolveUserFromCtx(ctx));

        if (!excluded && !isAdmin && !estCheminSante(path) && !estRobot(ctx)) {
          const hash = visiteurHash(ctx, jourCourant());

          if (hash) {
            // Présence « en ligne » : une ligne par empreinte (table bornée) ;
            // les lignes trop vieilles sont purgées au passage.
            const maintenant = Math.floor(Date.now() / 1000);
            await strapi.db.connection.raw(
              `
              INSERT INTO visitor_presence (hash, last_seen_at)
              VALUES (?, ?)
              ON CONFLICT (hash) DO UPDATE SET last_seen_at = excluded.last_seen_at;
              `,
              [hash, maintenant]
            );
            await strapi.db.connection.raw('DELETE FROM visitor_presence WHERE last_seen_at < ?', [
              maintenant - PRESENCE_RETENTION_SECONDES,
            ]);
          }
        }
      }
    } catch (err) {
      // Ne jamais bloquer la requête à cause du tracking
      console.error('Erreur tracking visite:', (err as Error).message);
    }

    await next();
  };
};
