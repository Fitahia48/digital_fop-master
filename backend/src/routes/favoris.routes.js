const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { addFavori, removeFavori, getMyFavoris } = require('../controllers/favoris.controller');

// Tous les endpoints favoris requièrent un usager connecté
router.post('/favoris/', authenticate, addFavori);
router.delete('/favoris/:document_id/', authenticate, removeFavori);
router.get('/favoris/', authenticate, getMyFavoris);

module.exports = router;
