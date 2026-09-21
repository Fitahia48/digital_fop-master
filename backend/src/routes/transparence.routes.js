const router = require('express').Router();
const { getStatsPubliques } = require('../controllers/transparence.controller');

// ─── Transparence (F12) ──────────────────────────────────────────────────────
// GET /api/transparence/stats/ — statistiques agrégées et anonymisées.
// Route volontairement PUBLIQUE : aucune authentification, aucune donnée
// personnelle (ni user_id, ni email). Elle alimente la page /transparence.
router.get('/transparence/stats/', getStatsPubliques);

module.exports = router;
