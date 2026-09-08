const router = require('express').Router();
const { getVisitStatistics } = require('../controllers/visits.controller');

// GET /visit-statistics/ & /visit-statistics
router.get('/visit-statistics/', getVisitStatistics);
router.get('/visit-statistics', getVisitStatistics);

module.exports = router;
