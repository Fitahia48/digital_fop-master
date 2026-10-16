/**
 * Statistiques de visites (portage de backend/src/controllers/visits.controller.js).
 *
 * La table `visits` reste HORS Strapi (D7 : tables analytiques hors
 * content-types) → accès SQL direct via strapi.db.connection, décision validée en MIGRATION.md §2.
 *
 * GET /api/statistics/visit-statistics — admin
 */
import { PRESENCE_FENETRE_MINUTES, visiteursEnLigne } from '../../../utils/analytics';
import { dateJourMadagascar } from '../../../utils/dates';
import { isAdminCtx } from '../../../utils/roles';
/**
 * `knex.raw()` renvoie un tableau de lignes sous sqlite/better-sqlite3 mais
 * `{ rows }` sous postgres : on normalise pour rester multi-dialectes
 * (la base locale est en sqlite, le legacy en postgres).
 */
const rowsOf = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.rows)) return raw.rows;
  return [];
};

const countOf = (raw: any): number => parseInt(rowsOf(raw)[0]?.count ?? 0, 10) || 0;

export const getVisitStatistics = async (ctx: any) => {
  // Vérification du rôle admin (helper partagé : src/utils/roles.ts)
  // NB : `ctx.strapi` n'existe plus en Strapi 5 — on utilise l'instance
  // globale `strapi` (comme les autres contrôleurs du projet).
  if (!(await isAdminCtx(ctx))) {
    return ctx.forbidden();
  }

  try {
    const { start_date, end_date } = ctx.query || {};

    const params: string[] = [];
    let where = '';
    if (start_date && end_date) {
      where = ' WHERE visit_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // Total des visites (cumulatif) = somme des total_visits par jour
    const totalResult = await strapi.db.connection.raw(
      `SELECT SUM(total_visits) AS count FROM daily_stats${where}`,
      params
    );
    const total_visits = countOf(totalResult);

    // Total des visiteurs uniques (cumulatif sur la période) = somme des unique_visitors par jour
    // Note : cela compte un visiteur plusieurs fois s'il a visité plusieurs jours pendant la période.
    // Si vous voulez le nombre de visiteurs distincts sur la période, il faudrait une autre approche.
    // Nous conservons le même comportement que l'original (somme des unique_visitors par jour).
    const uniqueResult = await strapi.db.connection.raw(
      `SELECT SUM(unique_visitors) AS count FROM daily_stats${where}`,
      params
    );
    const unique_visitors = countOf(uniqueResult);

    // Visites totales par jour
    const perDayResult = await strapi.db.connection.raw(
      `SELECT visit_date, total_visits AS count FROM daily_stats${where} ORDER BY visit_date`,
      params
    );

    // Visiteurs uniques par jour
    const uniquePerDayResult = await strapi.db.connection.raw(
      `SELECT visit_date, unique_visitors AS count FROM daily_stats${where} ORDER BY visit_date`,
      params
    );

    // Visites d'aujourd'hui (visiteurs uniques du jour) — même jour que le
    // comptage (utils/dates.ts), sinon aucune ligne ne correspond.
    const today = dateJourMadagascar();
    const todayResult = await strapi.db.connection.raw(
      'SELECT unique_visitors AS count FROM daily_stats WHERE visit_date = ?',
      [today]
    );
    const visits_today = countOf(todayResult);

    // Présence temps réel : visiteurs distincts vus dans la fenêtre courante
    // (table visitor_presence alimentée par le middleware track-visit).
    const visitors_online = await visiteursEnLigne();

    ctx.body = {
      total_visits,
      unique_visitors,
      total_visits_per_day: rowsOf(perDayResult),
      unique_visitors_per_day: rowsOf(uniquePerDayResult),
      visits_today,
      visitors_online,
      visitors_online_window_minutes: PRESENCE_FENETRE_MINUTES,
    };
  } catch (err) {
    console.error('getVisitStatistics error:', err);
    return ctx.internalServerError((err as Error).message);
  }
};

// Strapi n'enregistre un contrôleur que s'il expose un export `default`.
export default { getVisitStatistics };