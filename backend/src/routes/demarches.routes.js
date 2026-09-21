const router = require('express').Router();
const upload = require('../middleware/upload');
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  createDemarche, getMyDemarches, getAllDemarches, updateDemarcheStatus, getDemarcheTimeline,
} = require('../controllers/demarches.controller');

// Usager connecté
router.post('/demarches/', authenticate, upload.single('fichier'), createDemarche);
router.get('/demarches/mine/', authenticate, getMyDemarches);

// Administrateurs
router.get('/demarches/', authenticate, isAdmin, getAllDemarches);
router.patch('/demarches/:id/status/', authenticate, isAdmin, updateDemarcheStatus);

// Suivi : usager propriétaire ou admin (autorisation vérifiée dans le contrôleur)
router.get('/demarches/:id/timeline/', authenticate, getDemarcheTimeline);

module.exports = router;
