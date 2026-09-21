const router = require('express').Router();
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  getOrganigramme, createOrganigramme, updateOrganigramme, deleteOrganigramme,
} = require('../controllers/organigramme.controller');

// Public
router.get('/organigramme/', getOrganigramme);
router.get('/organigramme', getOrganigramme);

// Admin
router.post('/organigramme/', authenticate, isAdmin, createOrganigramme);
router.put('/organigramme/:id/', authenticate, isAdmin, updateOrganigramme);
router.patch('/organigramme/:id/', authenticate, isAdmin, updateOrganigramme);
router.delete('/organigramme/:id/', authenticate, isAdmin, deleteOrganigramme);

module.exports = router;
