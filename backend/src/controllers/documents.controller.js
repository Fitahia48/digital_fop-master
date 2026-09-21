const pool = require('../config/db');
const path = require('path');
const { sendNewPublicationEmail } = require('../config/mailer');

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
      type, domaine, domaine_id, status, searchBy, searchValue, dateJournal, numeroJournal,
      start_date, end_date, numero,
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
    if (domaine || domaine_id) {
      query += ` AND d.domaine_id = $${idx++}`;
      params.push(domaine || domaine_id);
    }
    // Statut juridique (en_vigueur / abrogé / modifié)
    if (status) {
      const statusMap = {
        en_vigueur: 'en_vigueur',
        'en vigueur': 'en_vigueur',
        vigueur: 'en_vigueur',
        abroge: 'abrogé',
        'abrogé': 'abrogé',
        modifie: 'modifié',
        'modifié': 'modifié',
      };
      const normalizedStatus = statusMap[status.toString().toLowerCase().trim()];
      if (normalizedStatus) {
        query += ` AND d.status = $${idx++}`;
        params.push(normalizedStatus);
      }
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
    // Plage de dates (envoyée par SearchBar sous start_date / end_date)
    if (start_date && end_date) {
      query += ` AND d.date BETWEEN $${idx++} AND $${idx++}`;
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ` AND d.date >= $${idx++}`;
      params.push(start_date);
    } else if (end_date) {
      query += ` AND d.date <= $${idx++}`;
      params.push(end_date);
    }
    // Recherche par numéro seul
    if (numero) {
      query += ` AND d.numero ILIKE $${idx++}`;
      params.push(`%${numero}%`);
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
    const pageNum = parseInt(page) || 1;
    const pageSizeNum = parseInt(page_size) || 10;
    const offset = (pageNum - 1) * pageSizeNum;
    query += ` ORDER BY d.id DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSizeNum, offset);

    const result = await pool.query(query, params);

    const hasNext = offset + pageSizeNum < total;
    const hasPrev = pageNum > 1;

    const queryParams = { ...req.query };
    delete queryParams.page;

    const buildPageUrl = (targetPage) => {
      const sp = new URLSearchParams(queryParams);
      sp.set('page', targetPage);
      return `/api/documents/?${sp.toString()}`;
    };

    return res.json({
      count: total,
      next: hasNext ? buildPageUrl(pageNum + 1) : null,
      previous: hasPrev ? buildPageUrl(pageNum - 1) : null,
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
    const docResult = await pool.query(
      `SELECT d.*, dom.nom AS domaine_nom FROM documents d LEFT JOIN domaines dom ON d.domaine_id = dom.id WHERE d.id = $1`,
      [req.params.id]
    );
    if (docResult.rows.length === 0) return res.status(404).json({ detail: 'Document non trouvé.' });
    const document = docResult.rows[0];

    // Relations inter-textes
    const [sources, cibles] = await Promise.all([
      pool.query(
        `SELECT r.id, r.type_relation, r.date_creation,
                d.id AS document_cible_id, d.numero, d.objet, d.type, d.date, d.status
         FROM document_relations r
         JOIN documents d ON r.document_cible_id = d.id
         WHERE r.document_source_id = $1
         ORDER BY r.id ASC`,
        [req.params.id]
      ),
      pool.query(
        `SELECT r.id, r.type_relation, r.date_creation,
                d.id AS document_source_id, d.numero, d.objet, d.type, d.date, d.status
         FROM document_relations r
         JOIN documents d ON r.document_source_id = d.id
         WHERE r.document_cible_id = $1
         ORDER BY r.id ASC`,
        [req.params.id]
      ),
    ]);

    document.relations_actives = sources.rows;   // Textes que ce document modifie/abroge/complète
    document.relations_passives = cibles.rows;  // Textes qui modifient/abrogent/complètent ce document

    return res.json(document);
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
      dateJournal, numeroJournal, pageJournal,
      modification_details, pdf_file, date_entree_vigueur,
      resume_simplifie
    } = req.body;

    const inclus = (inclus_journal || inclusJournal || 'false').toString().toLowerCase() === 'true';
    const fichierPath = buildFilePath(req.file);

    const result = await pool.query(
      `INSERT INTO documents
        (type, objet, numero, date, conseil, domaine_id, fichier, pdf_file, status,
         modification_details, date_entree_vigueur, inclus_journal, date_journal, numero_journal, page_journal,
         resume_simplifie)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        type, objet, numero, date, conseil || 'Autre', domaine || null,
        fichierPath, pdf_file || null, status || 'en_vigueur',
        modification_details || null,
        date_entree_vigueur || null,
        inclus,
        inclus ? (dateJournal || null) : null,
        inclus ? (numeroJournal || null) : null,
        inclus ? (pageJournal || null) : null,
        resume_simplifie || null,
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

    // Notification aux abonnés confirmés (fire-and-forget)
    setImmediate(async () => {
      try {
        const subs = await pool.query(
          'SELECT email, unsubscribe_token, langue_preferee FROM subscribers WHERE is_confirmed = TRUE'
        );
        await sendNewPublicationEmail(
          'document',
          `${result.rows[0].type} – ${result.rows[0].objet}`,
          null,
          subs.rows
        );
      } catch (mailErr) {
        console.error('Notification abonnés (document) erreur:', mailErr.message);
      }
    });

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
        modification_details = $13, date_entree_vigueur = $14,
        resume_simplifie = $15,
        last_modified_by = $16, last_modified_at = NOW()
       WHERE id = $17 RETURNING *`,
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
        body.modification_details !== undefined ? body.modification_details : doc.modification_details,
        body.date_entree_vigueur !== undefined ? (body.date_entree_vigueur || null) : doc.date_entree_vigueur,
        // Chaîne vide = suppression du résumé
        body.resume_simplifie !== undefined ? (body.resume_simplifie || null) : doc.resume_simplifie,
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
    if (!status) return res.status(400).json({ error: 'Le champ status est obligatoire.' });

    const validMap = {
      'en_vigueur': 'en_vigueur',
      'en vigueur': 'en_vigueur',
      'abroge': 'abrogé',
      'abrogé': 'abrogé',
      'modifie': 'modifié',
      'modifié': 'modifié',
    };
    const normalized = validMap[status.toString().toLowerCase().trim()];
    if (!normalized) {
      return res.status(400).json({
        error: 'Statut invalide. Valeurs autorisées : en_vigueur, abrogé, modifié.',
      });
    }

    const lastModifiedBy = req.user ? req.user.id : null;
    const result = await pool.query(
      'UPDATE documents SET status = $1, last_modified_by = COALESCE($2, last_modified_by), last_modified_at = NOW() WHERE id = $3 RETURNING id, status',
      [normalized, lastModifiedBy, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document non trouvé.' });
    return res.json({ message: 'Statut mis à jour avec succès.', status: result.rows[0].status });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// GET /api/documents/:id/relations/
const getDocumentRelations = async (req, res) => {
  try {
    const docId = req.params.id;
    const [sources, cibles] = await Promise.all([
      pool.query(
        `SELECT r.id, r.type_relation, r.date_creation,
                d.id AS document_cible_id, d.numero, d.objet, d.type, d.date, d.status
         FROM document_relations r
         JOIN documents d ON r.document_cible_id = d.id
         WHERE r.document_source_id = $1
         ORDER BY r.id ASC`,
        [docId]
      ),
      pool.query(
        `SELECT r.id, r.type_relation, r.date_creation,
                d.id AS document_source_id, d.numero, d.objet, d.type, d.date, d.status
         FROM document_relations r
         JOIN documents d ON r.document_source_id = d.id
         WHERE r.document_cible_id = $1
         ORDER BY r.id ASC`,
        [docId]
      ),
    ]);

    return res.json({
      relations_actives: sources.rows,
      relations_passives: cibles.rows,
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }
};

// POST /api/documents/:id/relations/
const createDocumentRelation = async (req, res) => {
  try {
    const document_source_id = parseInt(req.params.id);
    const { document_cible_id, type_relation } = req.body;

    if (!document_cible_id || !type_relation) {
      return res.status(400).json({ detail: 'document_cible_id et type_relation sont obligatoires.' });
    }

    if (document_source_id === parseInt(document_cible_id)) {
      return res.status(400).json({ detail: 'Un document ne peut pas avoir de relation avec lui-même.' });
    }

    const allowedTypes = ['modifie', 'abroge', 'complete'];
    if (!allowedTypes.includes(type_relation)) {
      return res.status(400).json({ detail: 'type_relation invalide. Valeurs autorisées: modifie, abroge, complete.' });
    }

    // Vérifier l'existence des deux documents
    const checkDocs = await pool.query(
      'SELECT id FROM documents WHERE id IN ($1, $2)',
      [document_source_id, document_cible_id]
    );
    if (checkDocs.rows.length < 2) {
      return res.status(404).json({ detail: 'L’un des deux documents n’existe pas.' });
    }

    const r = await pool.query(
      `INSERT INTO document_relations (document_source_id, document_cible_id, type_relation)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_source_id, document_cible_id, type_relation) DO NOTHING
       RETURNING *`,
      [document_source_id, document_cible_id, type_relation]
    );

    if (r.rows.length === 0) {
      return res.status(409).json({ detail: 'Cette relation existe déjà entre ces deux documents.' });
    }

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('createDocumentRelation error:', err);
    return res.status(500).json({ detail: err.message });
  }
};

// DELETE /api/document-relations/:id/
const deleteDocumentRelation = async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM document_relations WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ detail: 'Relation non trouvée.' });
    return res.status(204).send();
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
    const { pk, categorie, search, limit = 12 } = req.query;
    if (pk) {
      const r = await pool.query('SELECT * FROM actualites WHERE id = $1', [pk]);
      return res.json(r.rows);
    }
    // Recherche plein texte simple (utilisée par la recherche groupée du front)
    if (search && search.trim()) {
      const r = await pool.query(
        `SELECT * FROM actualites
         WHERE titre ILIKE $1 OR texte ILIKE $1 OR lieu ILIKE $1
         ORDER BY id DESC LIMIT $2`,
        [`%${search.trim()}%`, Math.min(Math.max(parseInt(limit) || 12, 1), 50)]
      );
      return res.json({ count: r.rowCount, results: r.rows });
    }
    // Filtre par catégorie (offre / nouveaute) — sinon, actualités par conseil (comportement historique)
    if (categorie && categorie !== 'actualite') {
      const r = await pool.query(
        'SELECT * FROM actualites WHERE categorie = $1 ORDER BY id DESC LIMIT 12',
        [categorie]
      );
      return res.json({ count: r.rowCount, results: r.rows });
    }
    const ministre = await pool.query(
      "SELECT * FROM actualites WHERE conseil = 'CONSEIL DES MINISTRES' AND categorie = 'actualite' ORDER BY id DESC LIMIT 4"
    );
    const gouvernement = await pool.query(
      "SELECT * FROM actualites WHERE conseil = 'CONSEIL DU GOUVERNEMENT' AND categorie = 'actualite' ORDER BY id DESC LIMIT 4"
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
    const { conseil, titre, date, lieu, texte, categorie } = req.body;
    const r = await pool.query(
      'INSERT INTO actualites (conseil, titre, date, lieu, texte, categorie) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [conseil, titre, date, lieu, texte, categorie || 'actualite']
    );
    // Notification aux abonnés confirmés (fire-and-forget)
    setImmediate(async () => {
      try {
        const subs = await pool.query(
          'SELECT email, unsubscribe_token, langue_preferee FROM subscribers WHERE is_confirmed = TRUE'
        );
        await sendNewPublicationEmail(
          'actualite',
          r.rows[0].titre,
          null,
          subs.rows
        );
      } catch (mailErr) {
        console.error('Notification abonnés (actualité) erreur:', mailErr.message);
      }
    });

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return res.status(400).json({ detail: err.message });
  }
};

const updateActualite = async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM actualites WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ detail: 'Actualité non trouvée.' });
    const current = existing.rows[0];

    const { conseil, titre, date, lieu, texte, categorie } = req.body;
    const r = await pool.query(
      'UPDATE actualites SET conseil=$1, titre=$2, date=$3, lieu=$4, texte=$5, categorie=$6 WHERE id=$7 RETURNING *',
      [
        conseil !== undefined ? conseil : current.conseil,
        titre !== undefined ? titre : current.titre,
        date !== undefined ? date : current.date,
        lieu !== undefined ? lieu : current.lieu,
        texte !== undefined ? texte : current.texte,
        categorie !== undefined && categorie !== null ? categorie : (current.categorie || 'actualite'),
        req.params.id,
      ]
    );
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
  getDocumentRelations, createDocumentRelation, deleteDocumentRelation,
  getMostVisitedDocuments, getDocumentStats, getDocumentStatsAPI, getSuggestions,
  getActualites, getActualite, createActualite, updateActualite, deleteActualite,
  getRemarks, createRemark, deleteRemark,
};
