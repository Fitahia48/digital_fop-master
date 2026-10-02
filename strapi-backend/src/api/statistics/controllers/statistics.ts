/**
 * Statistiques de visites (portage de backend/src/controllers/visits.controller.js).
 *
 * La table `visits` reste HORS Strapi (D7 : tables analytiques hors content-types)
 * → accès SQL direct via strapi.db.connection, décision validée en MIGRATION.md §2.
 *
 * GET /api/statistics/visit-statistics — admin
 */
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
    const total_visits = parseInt(totalResult.rows[0].count, 10);

    const uniqueResult = await strapi.db.connection.raw(
      `SELECT COUNT(*) AS count FROM (SELECT DISTINCT ip_address, visit_date FROM visits${where}) AS sub`,
      params
    );
    const unique_visitors = parseInt(uniqueResult.rows[0].count, 10);

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
    const visits_today = parseInt(todayResult.rows[0].count, 10);

    ctx.body = {
      total_visits,
      unique_visitors,
      total_visits_per_day: perDayResult.rows,
      unique_visitors_per_day: uniquePerDayResult.rows,
      visits_today,
    };
  } catch (err) {
    console.error('getVisitStatistics error:', err);
    return ctx.internalServerError((err as Error).message);
  }
};

// Strapi n'enregistre un contrôleur que s'il expose un export `default`.
export default { getVisitStatistics };
