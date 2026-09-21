const router = require('express').Router();
const { getFaqs, createFaq, updateFaq, deleteFaq, askFaq } = require('../controllers/faq.controller');
const { authenticate, isAdmin } = require('../middleware/auth');

// ─── FAQ ─────────────────────────────────────────────────────────────────────
// GET  /api/faq/           : liste complète (3 langues), public
// POST /api/faq/ask/       : question en langage naturel, public
// POST /api/faq/           : création (admin)
// PUT/PATCH /api/faq/:id/  : mise à jour (admin)
// DELETE /api/faq/:id/     : suppression (admin)

// Route « ask » déclarée avant /faq/:id/ pour éviter toute ambiguïté
router.post('/faq/ask/', askFaq);

router.get('/faq/', getFaqs);
router.post('/faq/', authenticate, isAdmin, createFaq);
router.put('/faq/:id/', authenticate, isAdmin, updateFaq);
router.patch('/faq/:id/', authenticate, isAdmin, updateFaq);
router.delete('/faq/:id/', authenticate, isAdmin, deleteFaq);

module.exports = router;
