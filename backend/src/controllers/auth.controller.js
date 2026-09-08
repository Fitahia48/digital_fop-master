const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

// Génère access + refresh tokens
const generateTokens = (user) => {
  const payload = { user_id: user.id, email: user.email, is_superuser: user.is_superuser };
  const access = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES || '120m' });
  const refresh = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES || '60d' });
  return { access, refresh };
};

// Envoi d'email d'activation
const sendActivationEmail = async (email, uid, token) => {
  if (!process.env.EMAIL_USER) return; // Skip si email non configuré
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
  });
  const activationUrl = `${process.env.DOMAIN}/activate/${uid}/${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Activation de votre compte - ${process.env.SITE_NAME}`,
    html: `<p>Cliquez sur ce lien pour activer votre compte :</p><a href="${activationUrl}">${activationUrl}</a>`,
  });
};

// POST /api/v1/auth/users/ — Inscription
const register = async (req, res) => {
  try {
    const { nom, prenom, email, password, re_password } = req.body;

    if (!nom || !prenom || !email || !password) {
      return res.status(400).json({ detail: 'Tous les champs sont obligatoires.' });
    }
    if (password !== re_password) {
      return res.status(400).json({ password: ['Les mots de passe ne correspondent pas.'] });
    }
    if (password.length < 8) {
      return res.status(400).json({ password: ['Le mot de passe doit contenir au moins 8 caractères.'] });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ email: ['Un utilisateur avec cet email existe déjà.'] });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const uid = uuidv4();
    const activationToken = jwt.sign({ email, uid }, process.env.JWT_SECRET, { expiresIn: '24h' });

    const result = await pool.query(
      `INSERT INTO users (nom, prenom, email, password, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id, nom, prenom, email, is_active, date_joined`,
      [nom, prenom, email, hashedPassword, false]
    );

    // Tenter d'envoyer l'email d'activation (ne bloque pas si echec)
    try {
      await sendActivationEmail(email, uid, activationToken);
    } catch (mailErr) {
      console.warn('Email d\'activation non envoyé:', mailErr.message);
    }

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur register:', err);
    return res.status(500).json({ detail: 'Erreur serveur.' });
  }
};

// POST /api/v1/auth/users/activation/ — Activer le compte
const activateAccount = async (req, res) => {
  try {
    const { uid, token } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email } = decoded;

    const result = await pool.query(
      'UPDATE users SET is_active = TRUE WHERE email = $1 RETURNING id, email, is_active',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ detail: 'Utilisateur non trouvé.' });
    }
    return res.status(200).json({ detail: 'Compte activé avec succès.' });
  } catch (err) {
    return res.status(400).json({ detail: 'Token d\'activation invalide ou expiré.' });
  }
};

// POST /api/v1/auth/jwt/create/ — Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email et mot de passe requis.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ detail: 'Identifiants incorrects.' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ detail: 'Compte non activé. Vérifiez votre email.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ detail: 'Identifiants incorrects.' });
    }

    const tokens = generateTokens(user);

    // Stocker le refresh token
    await pool.query(
      'INSERT INTO auth_tokens (user_id, token) VALUES ($1, $2)',
      [user.id, tokens.refresh]
    );

    // Redirect vers le dashboard React
    const redirect_url = '/dashboard';

    return res.status(200).json({ ...tokens, redirect_url });

  } catch (err) {
    console.error('Erreur login:', err);
    return res.status(500).json({ detail: 'Erreur serveur.' });
  }
};

// POST /api/v1/auth/jwt/refresh/ — Rafraîchir le token
const refreshToken = async (req, res) => {
  try {
    const { refresh } = req.body;
    if (!refresh) {
      return res.status(400).json({ detail: 'Refresh token manquant.' });
    }

    const decoded = jwt.verify(refresh, process.env.JWT_SECRET);
    const dbToken = await pool.query(
      'SELECT * FROM auth_tokens WHERE user_id = $1 AND token = $2',
      [decoded.user_id, refresh]
    );
    if (dbToken.rows.length === 0) {
      return res.status(401).json({ detail: 'Refresh token invalide.' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.user_id]);
    const user = userResult.rows[0];
    const newAccess = jwt.sign(
      { user_id: user.id, email: user.email, is_superuser: user.is_superuser },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES || '120m' }
    );

    return res.status(200).json({ access: newAccess });
  } catch (err) {
    return res.status(401).json({ detail: 'Refresh token invalide ou expiré.' });
  }
};

// GET /api/v1/auth/users/me/ — Profil utilisateur courant
const getMe = async (req, res) => {
  const user = req.user;
  return res.status(200).json({
    id: user.id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    is_staff: user.is_staff,
    is_superuser: user.is_superuser,
    is_active: user.is_active,
    date_joined: user.date_joined,
  });
};

// POST /api/v1/auth/users/reset_password/
const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ detail: 'Email requis.' });
    }
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Pour des raisons de sécurité, on retourne succès même si inexistant
      return res.status(200).json({ detail: 'Email de réinitialisation envoyé si le compte existe.' });
    }
    const token = jwt.sign({ user_id: result.rows[0].id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const uid = Buffer.from(String(result.rows[0].id)).toString('base64');
    
    // Tenter d'envoyer l'email
    if (process.env.EMAIL_USER) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.EMAIL_PORT) || 587,
          secure: false,
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
        });
        const resetUrl = `${process.env.DOMAIN}/password/reset/confirm/${uid}/${token}`;
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: email,
          subject: `Réinitialisation de mot de passe - ${process.env.SITE_NAME}`,
          html: `<p>Cliquez sur ce lien pour réinitialiser votre mot de passe :</p><a href="${resetUrl}">${resetUrl}</a>`,
        });
      } catch (mailErr) {
        console.warn('Erreur envoi email reset password:', mailErr.message);
      }
    }

    return res.status(200).json({ detail: 'Email de réinitialisation envoyé avec succès.' });
  } catch (err) {
    console.error('Erreur resetPassword:', err);
    return res.status(500).json({ detail: 'Erreur serveur.' });
  }
};

// POST /api/v1/auth/users/reset_password_confirm/
const resetPasswordConfirm = async (req, res) => {
  try {
    const { uid, token, new_password, re_new_password } = req.body;
    if (!new_password || new_password !== re_new_password) {
      return res.status(400).json({ detail: 'Les mots de passe ne correspondent pas.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user_id;

    const hashedPassword = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    return res.status(200).json({ detail: 'Mot de passe réinitialisé avec succès.' });
  } catch (err) {
    return res.status(400).json({ detail: 'Lien invalide ou expiré.' });
  }
};

module.exports = { register, activateAccount, login, refreshToken, getMe, resetPassword, resetPasswordConfirm };

