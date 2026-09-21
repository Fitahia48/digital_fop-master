const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Middleware: vérifie le JWT Bearer token
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ detail: 'Token manquant.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !['Bearer', 'JWT'].includes(parts[0])) {
    return res.status(401).json({ detail: 'Format de token invalide.' });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.user_id]);
    if (result.rows.length === 0) {
      return res.status(401).json({ detail: 'Utilisateur non trouvé.' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ detail: 'Token invalide ou expiré.' });
  }
};

/**
 * Middleware: décode le JWT si présent mais laisse passer les visiteurs anonymes.
 * Utilisé sur les endpoints mixtes (ex. recherche) où l'usager connecté bénéficie
 * de services personnalisés (historique, favoris) sans être obligatoire.
 */
const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !['Bearer', 'JWT'].includes(parts[0])) return next();

  try {
    const decoded = jwt.verify(parts[1], process.env.JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.user_id]);
    if (result.rows.length > 0) {
      req.user = result.rows[0];
    }
  } catch {
    // Token absent/expiré : on continue en anonyme, sans bloquer la requête
  }
  return next();
};

/**
 * Middleware: vérifie que l'utilisateur est admin (is_staff ou is_superuser)
 */
const isAdmin = (req, res, next) => {
  if (!req.user || (!req.user.is_staff && !req.user.is_superuser)) {
    return res.status(403).json({ detail: 'Accès réservé aux administrateurs.' });
  }
  next();
};

module.exports = { authenticate, isAdmin, optionalAuthenticate };
