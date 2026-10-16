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
 *
 * Trois écritures pour un visiteur compté :
 *  - `daily_stats`     : totaux du jour (visites + visiteurs uniques) ;
 *  - `visitor_daily`   : unicité du visiteur pour la journée ;
 *  - `visitor_presence`: dernier passage (présence « en ligne », temps réel).
 */
import { resolveUserFromCtx } from '../api/auth-compat/utils/legacy';
import { PRESENCE_RETENTION_SECONDES } from '../utils/analytics';
import { dateJourMadagascar } from '../utils/dates';
import { isAdminUser } from '../utils/roles';

// Fragments de chemin exclus du comptage (identiques au legacy)
const EXCLUDED_FRAGMENTS = ['visit-statistics', 'suggestions', 'app-ratings', '/media'];

// Extensions de fichiers statiques exclues
const EXCLUDED_EXTENSIONS = ['.ico', '.png', '.jpg', '.css', '.js'];

// Liste des user-agents de bots à exclure (non exhaustive)
const BOT_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckgo',
  'baiduspider',
  'yandex',
  'facebookexternalhit',
  'twitterbot',
  'developers.google.com/+https://developers.google.com/+/web/snippet/',
];

export default (_config: unknown, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    try {
      if (ctx.request.method === 'GET') {
        const path = String(ctx.request.path || '').toLowerCase();
        const excluded =
          EXCLUDED_FRAGMENTS.some((fragment) => path.includes(fragment)) ||
          EXCLUDED_EXTENSIONS.some((ext) => path.endsWith(ext));

        // Exclure les bots en vérifiant le user-agent
        const userAgent = ctx.request.headers['user-agent'] || '';
        const isBot = BOT_USER_AGENTS.some((bot) => userAgent.toLowerCase().includes(bot));

        // Vérifier si l'utilisateur est un administrateur.
        // NB : un middleware global s'exécute AVANT la stratégie d'auth de la
        // route → `ctx.state.user` n'est pas encore peuplé ici. On résout donc
        // l'usager depuis son Bearer (même helper que le module auth-compat) :
        // sinon les requêtes d'un admin étaient comptées comme des visites.
        const isAdmin = isAdminUser(await resolveUserFromCtx(ctx));

        if (!excluded && !isBot && !isAdmin) {
          // Récupérer l'adresse IP
          const ip = ctx.request.ip || ctx.request.socket?.remoteAddress || '0.0.0.0';

          // Jour courant à Madagascar — helper partagé avec les statistiques
          // (utils/dates.ts) : le comptage et la lecture doivent viser le même jour.
          const today = dateJourMadagascar();

          // Toujours incrémenter le compteur de visites totales pour aujourd'hui
          await strapi.db.connection.raw(
            `
            INSERT INTO daily_stats (visit_date, total_visits)
            VALUES (?, 1)
            ON CONFLICT (visit_date) DO UPDATE SET
              total_visits = total_visits + 1;
            `,
            [today]
          );

          // Créer un hash du visiteur (IP + user-agent + date + secret)
          // Le secret doit être défini dans les variables d'environnement
          const secret = process.env.VISITOR_SECRET || 'default_secret_should_be_changed';
          const hash = require('crypto')
            .createHash('sha256')
            .update(ip + userAgent + today + secret)
            .digest('hex');

          // Vérifier si ce hash a déjà été vu aujourd'hui
          const existing = await strapi.db.connection.raw(
            'SELECT id FROM visitor_daily WHERE hash = ? AND date = ?',
            [hash, today]
          );

          if (existing.length === 0) {
            // Insérer le hash dans la table visitor_daily
            await strapi.db.connection.raw(
              'INSERT INTO visitor_daily (hash, date) VALUES (?, ?)',
              [hash, today]
            );

            // Mettre à jour les statistiques quotidiennes (visiteurs uniques)
            await strapi.db.connection.raw(
              `
              INSERT INTO daily_stats (visit_date, unique_visitors)
              VALUES (?, 1)
              ON CONFLICT (visit_date) DO UPDATE SET
                unique_visitors = unique_visitors + 1;
              `,
              [today]
            );
          }

          // Présence « en ligne » (temps réel) : ce visiteur vient d'être vu.
          // Une seule ligne par visiteur (hash) → la table reste bornée ; les
          // lignes plus vieilles que la rétention sont purgées au passage.
          const maintenant = Math.floor(Date.now() / 1000);
          await strapi.db.connection.raw(
            `
            INSERT INTO visitor_presence (hash, last_seen_at)
            VALUES (?, ?)
            ON CONFLICT (hash) DO UPDATE SET
              last_seen_at = excluded.last_seen_at;
            `,
            [hash, maintenant]
          );
          await strapi.db.connection.raw(
            'DELETE FROM visitor_presence WHERE last_seen_at < ?',
            [maintenant - PRESENCE_RETENTION_SECONDES]
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