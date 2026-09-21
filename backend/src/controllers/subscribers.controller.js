const pool = require('../config/db');
const { sendConfirmationEmail, sendUnsubscribeConfirmationEmail } = require('../config/mailer');
const { resolveRequestLang } = require('../config/emailTemplates');

// Validation simple d'email
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ─── POST /api/subscribers/subscribe/ ────────────────────────────────────────

const subscribe = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ detail: 'Adresse email invalide.' });
    }

    const normalized = email.trim().toLowerCase();

    // Langue préférée : champ explicite du formulaire, sinon en-tête Accept-Language
    const langue_preferee = resolveRequestLang(req, req.body.langue_preferee);

    // Vérifie si l'email existe déjà
    const existing = await pool.query(
      'SELECT id, is_confirmed FROM subscribers WHERE email = $1',
      [normalized]
    );

    if (existing.rows.length > 0) {
      const sub = existing.rows[0];
      if (sub.is_confirmed) {
        return res.status(200).json({
          detail: 'Cet email est déjà abonné. Vous recevrez les prochaines publications.',
        });
      }
      // Pas encore confirmé : régénère un token et renvoie le mail
      const updated = await pool.query(
        `UPDATE subscribers
         SET confirm_token = gen_random_uuid(), created_at = NOW(), langue_preferee = $2
         WHERE email = $1
         RETURNING confirm_token`,
        [normalized, langue_preferee]
      );
      sendConfirmationEmail(normalized, updated.rows[0].confirm_token, langue_preferee).catch((err) =>
        console.error('Mailer confirm error:', err.message)
      );
      return res.status(200).json({
        detail: 'Un nouveau mail de confirmation a été envoyé à votre adresse.',
      });
    }

    // Création du nouvel abonné
    const result = await pool.query(
      `INSERT INTO subscribers (email, langue_preferee)
       VALUES ($1, $2)
       RETURNING confirm_token`,
      [normalized, langue_preferee]
    );

    // Envoi du mail de confirmation (fire-and-forget)
    sendConfirmationEmail(normalized, result.rows[0].confirm_token, langue_preferee).catch((err) =>
      console.error('Mailer confirm error:', err.message)
    );

    return res.status(201).json({
      detail: 'Inscription prise en compte. Vérifiez votre boîte mail pour confirmer votre abonnement.',
    });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── GET /api/subscribers/confirm/:token/ ────────────────────────────────────

const confirmSubscription = async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `UPDATE subscribers
       SET is_confirmed = TRUE
       WHERE confirm_token = $1 AND is_confirmed = FALSE
       RETURNING id, email`,
      [token]
    );

    if (result.rows.length === 0) {
      // Token invalide ou déjà confirmé
      return res.status(400).json({
        detail: 'Lien de confirmation invalide ou déjà utilisé.',
      });
    }

    return res.json({ detail: 'Votre abonnement a bien été confirmé. Merci !' });
  } catch (err) {
    console.error('confirmSubscription error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── GET /api/subscribers/unsubscribe/:token/ ────────────────────────────────

const unsubscribe = async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `DELETE FROM subscribers
       WHERE unsubscribe_token = $1
       RETURNING email, langue_preferee`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ detail: 'Lien de désabonnement invalide.' });
    }

    const { email, langue_preferee } = result.rows[0];

    // Envoi confirmation de désabonnement (fire-and-forget)
    sendUnsubscribeConfirmationEmail(email, langue_preferee).catch((err) =>
      console.error('Mailer unsubscribe error:', err.message)
    );

    return res.json({ detail: 'Vous avez bien été désabonné. Vous ne recevrez plus d\'alertes.' });
  } catch (err) {
    console.error('unsubscribe error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

module.exports = { subscribe, confirmSubscription, unsubscribe };
