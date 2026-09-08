const router = require('express').Router();
const {
  register,
  activateAccount,
  login,
  refreshToken,
  getMe,
  resetPassword,
  resetPasswordConfirm,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

// Inscription
router.post('/users/', register);

// Activation du compte
router.post('/users/activation/', activateAccount);

// Reset password
router.post('/users/reset_password/', resetPassword);
router.post('/users/reset_password_confirm/', resetPasswordConfirm);

// Login → retourne access + refresh tokens
router.post('/jwt/create/', login);

// Rafraîchir le token
router.post('/jwt/refresh/', refreshToken);

// Profil utilisateur courant (protégé)
router.get('/users/me/', authenticate, getMe);

module.exports = router;

