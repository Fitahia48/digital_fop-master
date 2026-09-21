const pool = require('../config/db');

// GET /api/organigramme/ — public, liste groupée par service
const getOrganigramme = async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM organigramme WHERE actif = TRUE ORDER BY service, ordre, id'
    );
    // Groupe par service
    const grouped = {};
    r.rows.forEach((item) => {
      const service = item.service || 'Autres';
      if (!grouped[service]) grouped[service] = [];
      grouped[service].push(item);
    });
    return res.json({
      count: r.rowCount,
      results: r.rows,
      grouped,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/organigramme/ — admin
const createOrganigramme = async (req, res) => {
  try {
    const { nom, poste, service, parent_id, ordre, actif } = req.body;
    if (!nom || !poste) {
      return res.status(400).json({ detail: 'nom et poste sont obligatoires.' });
    }
    const r = await pool.query(
      `INSERT INTO organigramme (nom, poste, service, parent_id, ordre, actif)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        nom,
        poste,
        service || 'Cabinet',
        parent_id || null,
        ordre || 0,
        actif !== undefined ? actif : true,
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

// PUT/PATCH /api/organigramme/:id/ — admin
const updateOrganigramme = async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM organigramme WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ detail: 'Entrée non trouvée.' });
    const d = existing.rows[0];
    const b = req.body;
    const r = await pool.query(
      `UPDATE organigramme SET nom = $1, poste = $2, service = $3, parent_id = $4, ordre = $5, actif = $6
       WHERE id = $7 RETURNING *`,
      [
        b.nom || d.nom,
        b.poste || d.poste,
        b.service || d.service,
        b.parent_id !== undefined ? b.parent_id : d.parent_id,
        b.ordre !== undefined ? b.ordre : d.ordre,
        b.actif !== undefined ? b.actif : d.actif,
        req.params.id,
      ]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

// DELETE /api/organigramme/:id/ — admin
const deleteOrganigramme = async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM organigramme WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ detail: 'Entrée non trouvée.' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

module.exports = { getOrganigramme, createOrganigramme, updateOrganigramme, deleteOrganigramme };
