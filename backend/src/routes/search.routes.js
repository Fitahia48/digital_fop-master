const router = require('express').Router();
const { webSearch, getSearchHistory } = require('../controllers/search.controller');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');

/**
 * POST /api/search
 * Corps attendu : { query: string, page?: number, page_size?: number,
 *                   type?: string, domaine?: number, status?: string }
 * Réponse :
 *  - webSearchAvailable: boolean
 *  - query: string (terme encodé pour lien Google manuel)
 *  - internalDocs: array (page courante des résultats MTeFOP, triés par pertinence)
 *  - internalDocsCount: number (total des résultats internes, tous filtres appliqués)
 *  - internalDocsPage: number
 *  - internalDocsHasMore: boolean
 *  - webItems?: array (résultats PSE, présent seulement si webSearchAvailable === true)
 */
// Auth facultative : peuple req.user si un JWT valide est fourni, sinon continue en anonyme
router.post('/search', optionalAuthenticate, webSearch);

// Historique de recherche synchronisé (usager connecté uniquement)
router.get('/search/history/', authenticate, getSearchHistory);

module.exports = router;
