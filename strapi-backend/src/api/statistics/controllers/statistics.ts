/**
 * Statistiques de visites (portage de backend/src/controllers/visits.controller.js).
 *
 * La table `visits` reste HORS Strapi (D7 : tables analytiques hors content-types)
 * → accès SQL direct via strapi.db.connection, décision validée en MIGRATION.md §2.
 *
 * GET /api/statistics/visit-statistics — admin
 */
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
  try {
    const { start_date, end_date } = ctx.query || {};

    const params: string[] = [];
    let where = '';
    if (start_date && end_date) {
      where = ' WHERE visit_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    const totalResult = await strapi.db.connection.raw(`SELECT COUNT(*) AS count FROM visits${where}`, params);
    const total_visits = countOf(totalResult);

    const uniqueResult = await strapi.db.connection.raw(
      `SELECT COUNT(*) AS count FROM (SELECT DISTINCT ip_address, visit_date FROM visits${where}) AS sub`,
      params
    );
    const unique_visitors = countOf(uniqueResult);

    const perDayResult = await strapi.db.connection.raw(
      `SELECT visit_date, COUNT(*) AS count FROM visits${where} GROUP BY visit_date ORDER BY visit_date`,
      params
    );
    const uniquePerDayResult = await strapi.db.connection.raw(
      `SELECT visit_date, COUNT(DISTINCT ip_address) AS count FROM visits${where} GROUP BY visit_date ORDER BY visit_date`,
      params
    );

    const today = new Date().toISOString().split('T')[0];
    const todayResult = await strapi.db.connection.raw('SELECT COUNT(*) AS count FROM visits WHERE visit_date = ?', [
      today,
    ]);
    const visits_today = countOf(todayResult);

    ctx.body = {
      total_visits,
      unique_visitors,
      total_visits_per_day: rowsOf(perDayResult),
      unique_visitors_per_day: rowsOf(uniquePerDayResult),
      visits_today,
    };
  } catch (err) {
    console.error('getVisitStatistics error:', err);
    return ctx.internalServerError((err as Error).message);
  }
};

// Strapi n'enregistre un contrôleur que s'il expose un export `default`.
export default { getVisitStatistics };
