const pool = require('../config/db');
const { matchFaqOrDocuments } = require('./search.controller');

const LANGUES = ['fr', 'en', 'mg'];

// Normalise la liste ordonnée des colonnes éditables de la FAQ
const EDITABLE_FIELDS = [
  'question_fr', 'question_en', 'question_mg',
  'reponse_fr', 'reponse_en', 'reponse_mg',
  'categorie', 'ordre',
];

// ─── GET /api/faq/ — liste complète (les 3 langues), filtre ?categorie= ──────

const getFaqs = async (req, res) => {
  try {
    const { categorie } = req.query;
    const params = [];
    let where = '';
    if (categorie) {
      where = 'WHERE categorie = $1';
      params.push(categorie);
    }

    const r = await pool.query(
      `SELECT id, question_fr, question_en, question_mg,
              reponse_fr, reponse_en, reponse_mg,
              categorie, ordre, created_at
       FROM faq
       ${where}
       ORDER BY ordre ASC, id ASC`,
      params
    );

    return res.json({ count: r.rowCount, results: r.rows });
  } catch (err) {
    console.error('getFaqs error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── POST /api/faq/ — création (admin) ──────────────────────────────────────

const createFaq = async (req, res) => {
  try {
    const b = req.body;
    const question_fr = (b.question_fr || '').trim();
    const reponse_fr = (b.reponse_fr || '').trim();

    // Le français sert de repli : il est obligatoire
    if (!question_fr || !reponse_fr) {
      return res.status(400).json({
        detail: 'La question et la réponse en français sont obligatoires.',
      });
    }

    const ordre = Number.isFinite(parseInt(b.ordre, 10)) ? parseInt(b.ordre, 10) : 0;

    const r = await pool.query(
      `INSERT INTO faq
         (question_fr, question_en, question_mg,
          reponse_fr, reponse_en, reponse_mg, categorie, ordre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        question_fr,
        (b.question_en || '').trim() || null,
        (b.question_mg || '').trim() || null,
        reponse_fr,
        (b.reponse_en || '').trim() || null,
        (b.reponse_mg || '').trim() || null,
        (b.categorie || '').trim() || null,
        ordre,
      ]
    );

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('createFaq error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── PATCH / PUT /api/faq/:id/ — mise à jour partielle (admin) ───────────────

const updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const sets = [];
    const params = [];
    let i = 1;

    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] === undefined) continue;

      let value = req.body[field];

      if (field === 'ordre') {
        value = Number.isFinite(parseInt(value, 10)) ? parseInt(value, 10) : 0;
      } else if (typeof value === 'string') {
        value = value.trim();
        // Les textes FR ne peuvent pas devenir vides (colonne NOT NULL + repli)
        if ((field === 'question_fr' || field === 'reponse_fr') && !value) {
          return res.status(400).json({
            detail: 'La question et la réponse en français ne peuvent pas être vides.',
          });
        }
        // Les autres champs facultatifs : chaîne vide → NULL
        if (!value) value = null;
      }

      sets.push(`${field} = $${i++}`);
      params.push(value);
    }

    if (sets.length === 0) {
      return res.status(400).json({ detail: 'Aucun champ à mettre à jour.' });
    }

    params.push(id);
    const r = await pool.query(
      `UPDATE faq SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ detail: 'Question FAQ introuvable.' });
    }

    return res.json(r.rows[0]);
  } catch (err) {
    console.error('updateFaq error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── DELETE /api/faq/:id/ — suppression (admin) ──────────────────────────────

const deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM faq WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) {
      return res.status(404).json({ detail: 'Question FAQ introuvable.' });
    }
    return res.json({ detail: 'Question FAQ supprimée.' });
  } catch (err) {
    console.error('deleteFaq error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── POST /api/faq/ask/ — question en langage naturel (public) ───────────────

const askFaq = async (req, res) => {
  try {
    const { question, lang } = req.body;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ detail: 'La question est obligatoire.' });
    }

    const result = await matchFaqOrDocuments(String(question).trim(), lang);
    return res.json(result);
  } catch (err) {
    console.error('askFaq error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

module.exports = {
  LANGUES,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  askFaq,
};
