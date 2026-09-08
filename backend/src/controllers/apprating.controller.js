const pool = require('../config/db');

// POST /submit-rating/
const submitRating = async (req, res) => {
  try {
    const { stars, session_id } = req.body;
    if (stars === undefined || stars === null || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Invalid rating' });
    }
    const r = await pool.query(
      'INSERT INTO app_ratings (stars, session_id) VALUES ($1, $2) RETURNING *',
      [stars, session_id || '']
    );
    return res.status(201).json({ message: 'Rating saved successfully', data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /submit-rating/ — Liste toutes les notes
const getRatings = async (req, res) => {
  try {
    const r = await pool.query('SELECT session_id, stars FROM app_ratings');
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /average-rating/
const getAverageRating = async (req, res) => {
  try {
    const r = await pool.query('SELECT COUNT(*) AS total, AVG(stars) AS avg FROM app_ratings');
    const total = parseInt(r.rows[0].total);
    if (total === 0) return res.json({ average_rating: 0 });
    return res.json({ average_rating: parseFloat(parseFloat(r.rows[0].avg).toFixed(1)) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET /total-stars/
const getTotalStars = async (req, res) => {
  try {
    const r = await pool.query('SELECT COALESCE(SUM(stars), 0) AS total FROM app_ratings');
    return res.json({ total_stars: parseInt(r.rows[0].total) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = { submitRating, getRatings, getAverageRating, getTotalStars };
