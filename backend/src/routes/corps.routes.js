const router = require('express').Router();
const upload = require('../middleware/upload');
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  getTypeCorps, createTypeCorps, deleteTypeCorps,
  getCorps, getCorpsById, createCorps, updateCorps, deleteCorps, updateCorpsStatus,
  getFilteredCorps, getCorpsProfessionnels,
  incrementCorpsVisit, incrementCorpsTelechargement, getMostVisitedCorps,
  getCorpsStats, getCorpsStatsAPI,
} = require('../controllers/corps.controller');

// ─── TYPE CORPS ───────────────────────────────────────────────────────────────
router.get('/typecorps/', getTypeCorps);
router.post('/typecorps/', authenticate, isAdmin, createTypeCorps);
router.delete('/typecorps/:id/', authenticate, isAdmin, deleteTypeCorps);

// ─── CORPS ────────────────────────────────────────────────────────────────────
router.get('/corps/', getCorps);
router.post('/corps/', authenticate, isAdmin, upload.single('fichier'), createCorps);
router.get('/corps/:id/', getCorpsById);
router.put('/corps/:id/', authenticate, isAdmin, upload.single('fichier'), updateCorps);
router.patch('/corps/:id/', authenticate, isAdmin, upload.single('fichier'), updateCorps);
router.delete('/corps/:id/', authenticate, isAdmin, deleteCorps);
router.patch('/corps/:id/update_status/', authenticate, isAdmin, updateCorpsStatus);

// ─── STATS & FILTRES ─────────────────────────────────────────────────────────
router.get('/corps-filter/', getFilteredCorps);
router.get('/corps-professionnels/', getCorpsProfessionnels);
router.get('/corps-stats/', getCorpsStats);
router.get('/corps-stats1/', getCorpsStatsAPI);
router.get('/most-visited-corps/', getMostVisitedCorps);

// ─── VISITS & TELECHARGEMENTS ────────────────────────────────────────────────
router.post('/corps/:corps_id/visit/', incrementCorpsVisit);
router.post('/corps/:corps_id/telechargement/', incrementCorpsTelechargement);

module.exports = router;
