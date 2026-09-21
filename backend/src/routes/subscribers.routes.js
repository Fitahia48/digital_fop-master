const router = require('express').Router();
const {
  subscribe,
  confirmSubscription,
  unsubscribe,
} = require('../controllers/subscribers.controller');

// POST /api/subscribers/subscribe/
router.post('/subscribers/subscribe/', subscribe);

// GET /api/subscribers/confirm/:token/
router.get('/subscribers/confirm/:token/', confirmSubscription);

// GET /api/subscribers/unsubscribe/:token/
router.get('/subscribers/unsubscribe/:token/', unsubscribe);

module.exports = router;
