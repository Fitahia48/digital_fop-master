const pool = require('../config/db');

// Middleware: Enregistre automatiquement chaque visite (équivalent du middleware Django)
const trackVisit = async (req, res, next) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || '';
    const today = new Date().toISOString().split('T')[0];

    await pool.query(
      'INSERT INTO visits (ip_address, user_agent, visit_date) VALUES ($1, $2, $3)',
      [ip, userAgent, today]
    );
  } catch (err) {
    // Ne pas bloquer la requête en cas d'erreur de tracking
    console.error('Erreur tracking visite:', err.message);
  }
  next();
};

// GET /visit-statistics/
const getVisitStatistics = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let baseQuery = 'FROM visits';
    const params = [];
    if (start_date && end_date) {
      baseQuery += ' WHERE timestamp BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    const totalResult = await pool.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const total_visits = parseInt(totalResult.rows[0].count);

    const uniqueResult = await pool.query(
      `SELECT COUNT(*) FROM (SELECT DISTINCT ip_address, visit_date ${baseQuery}) AS sub`,
      params
    );
    const unique_visitors = parseInt(uniqueResult.rows[0].count);

    const perDayResult = await pool.query(
      `SELECT visit_date, COUNT(*) AS count ${baseQuery} GROUP BY visit_date ORDER BY visit_date`,
      params
    );

    const uniquePerDayResult = await pool.query(
      `SELECT visit_date, COUNT(DISTINCT ip_address) AS count ${baseQuery} GROUP BY visit_date ORDER BY visit_date`,
      params
    );

    const today = new Date().toISOString().split('T')[0];
    const todayResult = await pool.query(
      'SELECT COUNT(*) FROM visits WHERE visit_date = $1',
      [today]
    );
    const visits_today = parseInt(todayResult.rows[0].count);

    return res.json({
      total_visits,
      unique_visitors,
      total_visits_per_day: perDayResult.rows,
      unique_visitors_per_day: uniquePerDayResult.rows,
      visits_today,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

module.exports = { trackVisit, getVisitStatistics };
