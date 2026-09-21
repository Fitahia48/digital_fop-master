const pool = require('../config/db');

// ─── POST /api/favoris/ — Ajouter un document aux favoris ────────────────────

const addFavori = async (req, res) => {
  try {
    const { document_id } = req.body;
    if (!document_id) {
      return res.status(400).json({ detail: 'Identifiant du document manquant.' });
    }

    // Le document doit exister
    const doc = await pool.query('SELECT id FROM documents WHERE id = $1', [document_id]);
    if (doc.rows.length === 0) {
      return res.status(404).json({ detail: 'Document introuvable.' });
    }

    // Déjà en favori ? Idempotent : on confirme sans dupliquer
    const existing = await pool.query(
      'SELECT id FROM favoris WHERE user_id = $1 AND document_id = $2',
      [req.user.id, document_id]
    );
    if (existing.rows.length > 0) {
      return res.status(200).json({ detail: 'Ce document est déjà dans vos favoris.', favori: true });
    }

    await pool.query(
      'INSERT INTO favoris (user_id, document_id) VALUES ($1, $2)',
      [req.user.id, document_id]
    );

    return res.status(201).json({ detail: 'Document ajouté à vos favoris.', favori: true });
  } catch (err) {
    console.error('addFavori error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── DELETE /api/favoris/:document_id/ — Retirer un document des favoris ─────

const removeFavori = async (req, res) => {
  try {
    const r = await pool.query(
      'DELETE FROM favoris WHERE user_id = $1 AND document_id = $2 RETURNING id',
      [req.user.id, req.params.document_id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ detail: "Ce document n'est pas dans vos favoris." });
    }
    return res.json({ detail: 'Document retiré de vos favoris.', favori: false });
  } catch (err) {
    console.error('removeFavori error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── GET /api/favoris/ — Favoris de l'usager connecté (infos documents) ──────

const getMyFavoris = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT f.id AS favori_id,
              f.created_at AS favori_created_at,
              d.id, d.type, d.objet, d.numero, d.date, d.status,
              d.fichier, d.pdf_file, d.visits, d.telechargements,
              dom.nom AS domaine_nom
       FROM favoris f
       JOIN documents d ON d.id = f.document_id
       LEFT JOIN domaines dom ON d.domaine_id = dom.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    return res.json({ count: r.rowCount, results: r.rows });
  } catch (err) {
    console.error('getMyFavoris error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

module.exports = { addFavori, removeFavori, getMyFavoris };
