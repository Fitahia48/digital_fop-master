const pool = require('../config/db');
const path = require('path');

// ─── DOMAINES ────────────────────────────────────────────────────────────────

// GET /api/domaines/
const getDomaines = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM domaines ORDER BY id DESC');
    return res.json({ count: result.rowCount, results: result.rows });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/domaines/
const createDomaine = async (req, res) => {
  try {
    const { nom } = req.body;
    const result = await pool.query(
      'INSERT INTO domaines (nom) VALUES ($1) RETURNING *',
      [nom]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

// DELETE /api/domaines/:id/
const deleteDomaine = async (req, res) => {
  try {
    await pool.query('DELETE FROM domaines WHERE id = $1', [req.params.id]);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// ─── DOCUMENTS ───────────────────────────────────────────────────────────────

// Construit le chemin relatif media pour le fichier uploadé
const buildFilePath = (file) => {
  if (!file) return null;
  return `documents/${file.filename}`;
};

// GET /api/documents/
const getDocuments = async (req, res) => {
  try {
    const {
      type, domaine, searchBy, searchValue, dateJournal, numeroJournal,
      page = 1, page_size = 10, search
    } = req.query;

    let query = `
      SELECT d.*, dom.nom AS domaine_nom
      FROM documents d
      LEFT JOIN domaines dom ON d.domaine_id = dom.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (type) {
      query += ` AND LOWER(d.type) LIKE LOWER($${idx++})`;
      params.push(`%${type}%`);
    }
    if (domaine) {
      query += ` AND d.domaine_id = $${idx++}`;
      params.push(domaine);
    }
    if (searchBy && searchValue) {
      if (['objet', 'numero'].includes(searchBy)) {
        query += ` AND LOWER(d.${searchBy}) LIKE LOWER($${idx++})`;
        params.push(`%${searchValue}%`);
      } else if (searchBy === 'date') {
        query += ` AND d.date = $${idx++}`;
        params.push(searchValue);
      }
    }
    if (search) {
      query += ` AND (LOWER(d.objet) LIKE LOWER($${idx}) OR LOWER(d.numero) LIKE LOWER($${idx}))`;
      params.push(`%${search}%`);
      idx++;
    }
    if (dateJournal) {
      query += ` AND d.date_journal = $${idx++}`;
      params.push(dateJournal);
    }
    if (numeroJournal) {
      query += ` AND LOWER(d.numero_journal) LIKE LOWER($${idx++})`;
      params.push(`%${numeroJournal}%`);
    }

    // Compte total
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) AS sub`, params);
    const total = parseInt(countResult.rows[0].count);

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    query += ` ORDER BY d.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(page_size), offset);

    const result = await pool.query(query, params);

    return res.json({
      count: total,
      next: offset + parseInt(page_size) < total ? true : null,
      previous: page > 1 ? true : null,
      results: result.rows,
    });
  } catch (err) {
    console.error('getDocuments error:', err);
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/documents/:id/
const getDocument = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, dom.nom AS domaine_nom FROM documents d LEFT JOIN domaines dom ON d.domaine_id = dom.id WHERE d.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ detail: 'Document non trouvé.' });
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/documents/
const createDocument = async (req, res) => {
  try {
    const {
      type, objet, numero, date, conseil, domaine,
      status, inclus_journal, inclusJournal,
      dateJournal, numeroJournal, pageJournal
    } = req.body;

    const inclus = (inclus_journal || inclusJournal || 'false').toString().toLowerCase() === 'true';
    const fichierPath = buildFilePath(req.file);

    const result = await pool.query(
      `INSERT INTO documents
        (type, objet, numero, date, conseil, domaine_id, fichier, status,
         inclus_journal, date_journal, numero_journal, page_journal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        type, objet, numero, date, conseil || 'Autre', domaine || null,
        fichierPath, status || 'En vigueur',
        inclus,
        inclus ? (dateJournal || null) : null,
        inclus ? (numeroJournal || null) : null,
        inclus ? (pageJournal || null) : null,
      ]
    );

    // Mise à jour des stats
    const today = new Date().toISOString().split('T')[0];
    await pool.query(
      `INSERT INTO document_stats (date, daily_count, monthly_count, yearly_count)
       VALUES ($1, 1, 1, 1)
       ON CONFLICT (date) DO UPDATE
       SET daily_count = document_stats.daily_count + 1,
           monthly_count = document_stats.monthly_count + 1,
           yearly_count = document_stats.yearly_count + 1`,
      [today]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('createDocument error:', err);
    return res.status(400).json({ detail: err.message });
  }
};

// PATCH /api/documents/:id/
const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ detail: 'Document non trouvé.' });

    const doc = existing.rows[0];
    const body = req.body;

    const fichierPath = req.file ? buildFilePath(req.file) : doc.fichier;
    const lastModifiedBy = req.user ? req.user.id : null;

    const result = await pool.query(
      `UPDATE documents SET
        type = $1, objet = $2, numero = $3, date = $4, conseil = $5,
        domaine_id = $6, fichier = $7, status = $8,
        inclus_journal = $9, date_journal = $10, numero_journal = $11, page_journal = $12,
        last_modified_by = $13, last_modified_at = NOW()
       WHERE id = $14 RETURNING *`,
      [
        body.type || doc.type,
        body.objet || doc.objet,
        body.numero || doc.numero,
        body.date || doc.date,
        body.conseil || doc.conseil,
        body.domaine_id || body.domaine || doc.domaine_id,
        fichierPath,
        body.status || doc.status,
        body.inclus_journal !== undefined ? body.inclus_journal : doc.inclus_journal,
        body.date_journal || doc.date_journal,
        body.numero_journal || doc.numero_journal,
        body.page_journal || doc.page_journal,
        lastModifiedBy,
        id,
      ]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateDocument error:', err);
    return res.status(400).json({ detail: err.message });
  }
};

// DELETE /api/documents/:id/
const deleteDocument = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ detail: 'Document non trouvé.' });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// PATCH /api/documents/:id/status/
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status field is required.' });
    const result = await pool.query(
      'UPDATE documents SET status = $1 WHERE id = $2 RETURNING status',
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found.' });
    return res.json({ message: 'Status updated successfully.', status: result.rows[0].status });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/documents/:id/visit/
const incrementDocumentVisit = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE documents SET visits = visits + 1 WHERE id = $1 RETURNING id',
      [req.params.document_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document non trouvé' });
    return res.json({ message: 'Visite enregistrée' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/documents/:id/telechargement/
const incrementDocumentTelechargement = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE documents SET telechargements = telechargements + 1 WHERE id = $1 RETURNING id',
      [req.params.document_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document non trouvé' });
    return res.json({ message: 'Téléchargement enregistré' });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/most-visited/
const getMostVisitedDocuments = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT d.*, dom.nom AS domaine_nom FROM documents d LEFT JOIN domaines dom ON d.domaine_id = dom.id ORDER BY d.visits DESC LIMIT 10'
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/document-stats/
const getDocumentStats = async (req, res) => {
  try {
    const { type } = req.query;
    if (type) {
      const count = await pool.query('SELECT COUNT(*) FROM documents WHERE LOWER(type) = LOWER($1)', [type]);
      return res.json({ type, count: parseInt(count.rows[0].count) });
    }
    const total = await pool.query('SELECT COUNT(*) FROM documents');
    const byType = await pool.query(
      'SELECT type, COUNT(*) AS count FROM documents GROUP BY type ORDER BY type'
    );
    return res.json({
      total_documents: parseInt(total.rows[0].count),
      documents_by_type: byType.rows,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/documents-stats/
const getDocumentStatsAPI = async (req, res) => {
  try {
    const { period = 'daily', start_date, end_date } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();

    let total = 0;
    if (period === 'daily') {
      const range = start_date && end_date
        ? await pool.query('SELECT COALESCE(SUM(daily_count),0) AS total FROM document_stats WHERE date BETWEEN $1 AND $2', [start_date, end_date])
        : await pool.query('SELECT COALESCE(SUM(daily_count),0) AS total FROM document_stats WHERE date = $1', [today]);
      total = parseInt(range.rows[0].total);
    } else if (period === 'monthly') {
      const r = await pool.query(
        'SELECT COALESCE(SUM(monthly_count),0) AS total FROM document_stats WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2',
        [month, year]
      );
      total = parseInt(r.rows[0].total);
    } else if (period === 'yearly') {
      const r = await pool.query(
        'SELECT COALESCE(SUM(yearly_count),0) AS total FROM document_stats WHERE EXTRACT(YEAR FROM date) = $1',
        [year]
      );
      total = parseInt(r.rows[0].total);
    } else {
      return res.status(400).json({ error: "Période invalide. Utilisez 'daily', 'monthly' ou 'yearly'." });
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

// GET /api/suggestions/
const getSuggestions = async (req, res) => {
  try {
    const { searchBy = 'objet', query = '', type } = req.query;
    if (!query.trim()) return res.json([]);

    const q = `%${query.toLowerCase()}%`;
    let sql, params;

    if (searchBy === 'type') {
      sql = 'SELECT DISTINCT type FROM documents WHERE LOWER(type) LIKE $1 LIMIT 10';
      params = [q];
    } else if (['objet', 'numero'].includes(searchBy)) {
      sql = `SELECT DISTINCT ${searchBy} FROM documents WHERE LOWER(${searchBy}) LIKE $1`;
      params = [q];
      if (type) {
        sql += ' AND LOWER(type) LIKE $2';
        params.push(`%${type.toLowerCase()}%`);
      }
      sql += ' LIMIT 10';
    } else {
      return res.json([]);
    }

    const result = await pool.query(sql, params);
    return res.json(result.rows.map((r) => r[searchBy] || r.type));
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// ─── ACTUALITES ───────────────────────────────────────────────────────────────

const getActualites = async (req, res) => {
  try {
    const { pk } = req.query;
    if (pk) {
      const r = await pool.query('SELECT * FROM actualites WHERE id = $1', [pk]);
      return res.json(r.rows);
    }
    const ministre = await pool.query(
      "SELECT * FROM actualites WHERE conseil = 'CONSEIL DES MINISTRES' ORDER BY id DESC LIMIT 4"
    );
    const gouvernement = await pool.query(
      "SELECT * FROM actualites WHERE conseil = 'CONSEIL DU GOUVERNEMENT' ORDER BY id DESC LIMIT 4"
    );
    return res.json({ count: ministre.rowCount + gouvernement.rowCount, results: [...ministre.rows, ...gouvernement.rows] });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

const getActualite = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM actualites WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ detail: 'Actualité non trouvée.' });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

const createActualite = async (req, res) => {
  try {
    const { conseil, titre, date, lieu, texte } = req.body;
    const r = await pool.query(
      'INSERT INTO actualites (conseil, titre, date, lieu, texte) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [conseil, titre, date, lieu, texte]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

const updateActualite = async (req, res) => {
  try {
    const { conseil, titre, date, lieu, texte } = req.body;
    const r = await pool.query(
      'UPDATE actualites SET conseil=$1, titre=$2, date=$3, lieu=$4, texte=$5 WHERE id=$6 RETURNING *',
      [conseil, titre, date, lieu, texte, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ detail: 'Actualité non trouvée.' });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

const deleteActualite = async (req, res) => {
  try {
    await pool.query('DELETE FROM actualites WHERE id = $1', [req.params.id]);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// ─── REMARKS ─────────────────────────────────────────────────────────────────

const getRemarks = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM remarks ORDER BY created_at DESC');
    return res.json({ count: r.rowCount, results: r.rows });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

const createRemark = async (req, res) => {
  try {
    const { email, message } = req.body;
    const r = await pool.query(
      'INSERT INTO remarks (email, message) VALUES ($1,$2) RETURNING *',
      [email, message]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

const deleteRemark = async (req, res) => {
  try {
    await pool.query('DELETE FROM remarks WHERE id = $1', [req.params.id]);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

module.exports = {
  getDomaines, createDomaine, deleteDomaine,
  getDocuments, getDocument, createDocument, updateDocument, deleteDocument,
  updateStatus, incrementDocumentVisit, incrementDocumentTelechargement,
  getMostVisitedDocuments, getDocumentStats, getDocumentStatsAPI, getSuggestions,
  getActualites, getActualite, createActualite, updateActualite, deleteActualite,
  getRemarks, createRemark, deleteRemark,
};
