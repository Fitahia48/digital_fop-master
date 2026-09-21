const pool = require('../config/db');

const CORPS_PROFESSIONNELS = [
  'Administration Publique', 'Administration Judiciaire', 'Administration Pénitentiaire',
  'Agriculture-Elevage-Pêche', 'Chercheur enseignant et Enseignement chercheur',
  'Communication médiatisée', 'Diplomatie', 'Domaine-Topographie',
  'Environnement Eaux et Forêts', 'Éducation de base et Enseignement secondaire',
  'Énergie, Mines et Ressources', 'Économie, Finances et Plan',
  "Inspection de l'Etat", 'Forces Armées', 'Jeunesse et Sports',
  'Météorologie', 'Planification', 'Police nationale',
  'Poste et Télécommunications', 'Travail et Lois Sociales',
  'Corps transversaux', 'Travaux publics, Habitat et Aménagement',
  'Transports', 'Santé Publique',
];

const buildFilePath = (file) => file ? `documents/${file.filename}` : null;

// ─── TYPE CORPS ───────────────────────────────────────────────────────────────

const getTypeCorps = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM type_corps ORDER BY id');
    return res.json({ count: r.rowCount, results: r.rows });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

const createTypeCorps = async (req, res) => {
  try {
    const { nom } = req.body;
    const r = await pool.query('INSERT INTO type_corps (nom) VALUES ($1) RETURNING *', [nom]);
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

const deleteTypeCorps = async (req, res) => {
  try {
    await pool.query('DELETE FROM type_corps WHERE id = $1', [req.params.id]);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// ─── CORPS ────────────────────────────────────────────────────────────────────

// GET /api/corps/
const getCorps = async (req, res) => {
  try {
    const { page = 1, page_size = 10, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    const params = [];
    let where = '';
    if (search && search.trim()) {
      where = 'WHERE (c.nom ILIKE $1 OR c.numero ILIKE $1 OR c.description ILIKE $1)';
      params.push(`%${search.trim()}%`);
    }

    const count = await pool.query(`SELECT COUNT(*) FROM corps c ${where}`, params);
    const r = await pool.query(
      `SELECT c.*, t.nom AS type_nom
       FROM corps c
       LEFT JOIN type_corps t ON c.type_id = t.id
       ${where}
       ORDER BY c.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(page_size), offset]
    );
    return res.json({ count: parseInt(count.rows[0].count), results: r.rows });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/corps/:id/
const getCorpsById = async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT c.*, t.nom AS type_nom FROM corps c LEFT JOIN type_corps t ON c.type_id = t.id WHERE c.id = $1',
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ detail: 'Corps non trouvé.' });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/corps/
const createCorps = async (req, res) => {
  try {
    const { nom, numero, description, type_id, date_creation, status } = req.body;
    const fichierPath = buildFilePath(req.file);

    const r = await pool.query(
      `INSERT INTO corps (nom, numero, description, type_id, date_creation, status, fichier)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [nom, numero, description, type_id || null, date_creation, status || null, fichierPath]
    );

    // Stats
    const today = new Date().toISOString().split('T')[0];
    await pool.query(
      `INSERT INTO corps_stats (date, daily_count, monthly_count, yearly_count)
       VALUES ($1, 1, 1, 1)
       ON CONFLICT (date) DO UPDATE
       SET daily_count = corps_stats.daily_count + 1,
           monthly_count = corps_stats.monthly_count + 1,
           yearly_count = corps_stats.yearly_count + 1`,
      [today]
    );

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('createCorps error:', err);
    return res.status(400).json({ detail: err.message });
  }
};

// PATCH /api/corps/:id/
const updateCorps = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM corps WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ detail: 'Corps non trouvé.' });
    const corps = existing.rows[0];
    const body = req.body;
    const fichierPath = req.file ? buildFilePath(req.file) : corps.fichier;

    const r = await pool.query(
      `UPDATE corps SET nom=$1, numero=$2, description=$3, type_id=$4,
       date_creation=$5, status=$6, fichier=$7 WHERE id=$8 RETURNING *`,
      [
        body.nom || corps.nom, body.numero || corps.numero,
        body.description || corps.description, body.type_id || corps.type_id,
        body.date_creation || corps.date_creation, body.status || corps.status,
        fichierPath, id,
      ]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

// DELETE /api/corps/:id/
const deleteCorps = async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM corps WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ detail: 'Corps non trouvé.' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// PATCH /api/corps/:id/update_status/
const updateCorpsStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['actif', 'inactif'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    await pool.query('UPDATE corps SET status = $1 WHERE id = $2', [status, req.params.id]);
    return res.json({ message: 'Statut mis à jour avec succès.' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/corps-filter/
const getFilteredCorps = async (req, res) => {
  try {
    const { corps } = req.query;
    const r = corps
      ? await pool.query('SELECT * FROM corps WHERE nom = $1', [corps])
      : await pool.query('SELECT * FROM corps');
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/corps-professionnels/
const getCorpsProfessionnels = async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nom FROM corps');
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/corps/:id/visit/
const incrementCorpsVisit = async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE corps SET visits = visits + 1 WHERE id = $1 RETURNING id',
      [req.params.corps_id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Corps non trouvé' });
    return res.json({ message: 'Visite enregistrée' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/corps/:id/telechargement/
const incrementCorpsTelechargement = async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE corps SET telechargements = telechargements + 1 WHERE id = $1 RETURNING id',
      [req.params.corps_id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Corps non trouvé' });
    return res.json({ message: 'Téléchargement enregistré' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/most-visited-corps/
const getMostVisitedCorps = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM corps ORDER BY visits DESC LIMIT 10');
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/corps-stats/
const getCorpsStats = async (req, res) => {
  try {
    const { nom } = req.query;
    if (nom) {
      const count = await pool.query('SELECT COUNT(*) FROM corps WHERE nom = $1', [nom]);
      return res.json({ nom, count: parseInt(count.rows[0].count) });
    }
    const total = await pool.query('SELECT COUNT(*) FROM corps');
    const byNom = await pool.query('SELECT nom, COUNT(*) AS count FROM corps GROUP BY nom ORDER BY nom');
    return res.json({ total_corps: parseInt(total.rows[0].count), corps_by_nom: byNom.rows });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/corps-stats1/
const getCorpsStatsAPI = async (req, res) => {
  try {
    const { period = 'daily', start_date, end_date } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    let total = 0;
    if (period === 'daily') {
      const r = start_date && end_date
        ? await pool.query('SELECT COALESCE(SUM(daily_count),0) AS total FROM corps_stats WHERE date BETWEEN $1 AND $2', [start_date, end_date])
        : await pool.query('SELECT COALESCE(SUM(daily_count),0) AS total FROM corps_stats WHERE date = $1', [today]);
      total = parseInt(r.rows[0].total);
    } else if (period === 'monthly') {
      const r = await pool.query(
        'SELECT COALESCE(SUM(monthly_count),0) AS total FROM corps_stats WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2',
        [month, year]
      );
      total = parseInt(r.rows[0].total);
    } else if (period === 'yearly') {
      const r = await pool.query(
        'SELECT COALESCE(SUM(yearly_count),0) AS total FROM corps_stats WHERE EXTRACT(YEAR FROM date) = $1',
        [year]
      );
      total = parseInt(r.rows[0].total);
    } else {
      return res.status(400).json({ error: "Période invalide." });
    }

    return res.json({
      daily_count: period === 'daily' ? total : 0,
      monthly_count: period === 'monthly' ? total : 0,
      yearly_count: period === 'yearly' ? total : 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getTypeCorps, createTypeCorps, deleteTypeCorps,
  getCorps, getCorpsById, createCorps, updateCorps, deleteCorps, updateCorpsStatus,
  getFilteredCorps, getCorpsProfessionnels,
  incrementCorpsVisit, incrementCorpsTelechargement, getMostVisitedCorps,
  getCorpsStats, getCorpsStatsAPI,
};
