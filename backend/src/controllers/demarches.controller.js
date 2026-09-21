const pool = require('../config/db');
const { sendDemarcheStatusEmail } = require('../config/mailer');

// Types de démarche autorisés (libellés affichés côté front)
const TYPES_DEMARCHE = [
  'copie_certifiee',
  'attestation',
  'demande_information',
  'autre',
];

const STATUTS = ['soumise', 'en_cours', 'traitee', 'rejetee'];

// ─── POST /api/demarches/ — Création d'une démarche (usager connecté) ────────

const createDemarche = async (req, res) => {
  try {
    const { type_demarche, objet, document_id } = req.body;

    if (!type_demarche || !TYPES_DEMARCHE.includes(type_demarche)) {
      return res.status(400).json({ detail: 'Type de démarche invalide.' });
    }
    if (!objet || !objet.trim()) {
      return res.status(400).json({ detail: "L'objet de la demande est obligatoire." });
    }

    // Vérification optionnelle du document lié
    let docId = null;
    if (document_id) {
      const doc = await pool.query('SELECT id FROM documents WHERE id = $1', [document_id]);
      if (doc.rows.length === 0) {
        return res.status(400).json({ detail: 'Document lié introuvable.' });
      }
      docId = parseInt(document_id);
    }

    // Transaction : la démarche et son entrée initiale de timeline sont créées ensemble
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO demarches (user_id, type_demarche, objet, document_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.user.id, type_demarche, objet.trim(), docId]
      );
      const demarche = result.rows[0];

      // Journal append-only : état initial de la démarche
      await client.query(
        `INSERT INTO demarche_timeline (demarche_id, statut, commentaire, modifie_par)
         VALUES ($1, 'soumise', 'Demande enregistrée.', $2)`,
        [demarche.id, req.user.id]
      );

      await client.query('COMMIT');

      // Pièce jointe facultative (middleware upload existant, champ « fichier »)
      if (req.file) {
        await client.query(
          'INSERT INTO demarche_pieces_jointes (demarche_id, fichier) VALUES ($1, $2)',
          [demarche.id, `documents/${req.file.filename}`]
        );
      }

      return res.status(201).json({
        detail: 'Votre demande a bien été enregistrée. Vous serez notifié(e) de son évolution par email.',
        demarche,
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('createDemarche error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── GET /api/demarches/mine/ — Démarches de l'usager connecté ───────────────

const getMyDemarches = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT d.*,
              doc.type AS document_type,
              doc.numero AS document_numero,
              doc.objet AS document_objet,
              (SELECT COUNT(*) FROM demarche_pieces_jointes pj WHERE pj.demarche_id = d.id) AS nb_pieces_jointes
       FROM demarches d
       LEFT JOIN documents doc ON doc.id = d.document_id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    return res.json({ count: r.rowCount, results: r.rows });
  } catch (err) {
    console.error('getMyDemarches error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── GET /api/demarches/ — Toutes les démarches (admin), filtre ?statut= ─────

const getAllDemarches = async (req, res) => {
  try {
    const { statut } = req.query;
    if (statut && !STATUTS.includes(statut)) {
      return res.status(400).json({ detail: 'Statut invalide. Valeurs : soumise, en_cours, traitee, rejetee.' });
    }

    const params = [];
    let where = '';
    if (statut) {
      where = 'WHERE d.statut = $1';
      params.push(statut);
    }

    const r = await pool.query(
      `SELECT d.*,
              u.nom AS usager_nom,
              u.prenom AS usager_prenom,
              u.email AS usager_email,
              doc.type AS document_type,
              doc.numero AS document_numero,
              doc.objet AS document_objet,
              (SELECT COUNT(*) FROM demarche_pieces_jointes pj WHERE pj.demarche_id = d.id) AS nb_pieces_jointes
       FROM demarches d
       JOIN users u ON u.id = d.user_id
       LEFT JOIN documents doc ON doc.id = d.document_id
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );
    return res.json({ count: r.rowCount, results: r.rows });
  } catch (err) {
    console.error('getAllDemarches error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── PATCH /api/demarches/:id/status/ — Changement de statut (admin) ─────────

const updateDemarcheStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, commentaire_admin } = req.body;

    if (!statut || !STATUTS.includes(statut)) {
      return res.status(400).json({ detail: 'Statut invalide. Valeurs : soumise, en_cours, traitee, rejetee.' });
    }

    const existing = await pool.query(
      `SELECT d.*, u.email AS usager_email, u.prenom AS usager_prenom,
              u.langue_preferee AS usager_langue
       FROM demarches d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ detail: 'Démarche introuvable.' });
    }
    const demarche = existing.rows[0];

    // Transaction : la mise à jour et la ligne de timeline doivent être cohérentes
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await client.query(
        `UPDATE demarches
         SET statut = $1,
             commentaire_admin = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [statut, commentaire_admin !== undefined ? commentaire_admin : demarche.commentaire_admin, id]
      );

      // Journal append-only : une ligne par changement de statut effectif
      // (pas d'entrée si l'admin enregistre sans changer le statut)
      await client.query(
        `INSERT INTO demarche_timeline (demarche_id, statut, commentaire, modifie_par)
         VALUES ($1, $2, $3, $4)`,
        [id, statut, commentaire_admin || null, req.user.id]
      );

      await client.query('COMMIT');

      // Notification email à l'usager (fire-and-forget, ne bloque jamais la réponse)
      sendDemarcheStatusEmail(
        demarche.usager_email,
        demarche.type_demarche,
        statut,
        commentaire_admin || null,
        demarche.usager_langue
      ).catch((err) => console.error('Mailer démarche error:', err.message));

      return res.json({
        detail: 'Statut mis à jour. L\'usager a été notifié par email.',
        demarche: updated.rows[0],
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('updateDemarcheStatus error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

// ─── GET /api/demarches/:id/timeline/ — Historique complet d'une démarche ────

const getDemarcheTimeline = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      `SELECT d.*, u.email AS usager_email
       FROM demarches d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ detail: 'Démarche introuvable.' });
    }
    const demarche = existing.rows[0];

    // L'usager ne voit que ses propres démarches ; l'admin voit tout
    const estAdmin = req.user.is_staff || req.user.is_superuser;
    if (demarche.user_id !== req.user.id && !estAdmin) {
      return res.status(403).json({ detail: "Vous n'avez pas accès au suivi de cette démarche." });
    }

    const timeline = await pool.query(
      `SELECT t.id, t.statut, t.commentaire, t.created_at,
              t.modifie_par,
              u.nom AS admin_nom, u.prenom AS admin_prenom
       FROM demarche_timeline t
       LEFT JOIN users u ON u.id = t.modifie_par
       WHERE t.demarche_id = $1
       ORDER BY t.created_at ASC, t.id ASC`,
      [id]
    );

    // Détails optionnels pour l'affichage (document lié, pièces jointes)
    const doc = demarche.document_id
      ? await pool.query('SELECT id, type, numero, objet FROM documents WHERE id = $1', [demarche.document_id])
      : { rows: [] };
    const pieces = await pool.query(
      'SELECT id, fichier, uploaded_at FROM demarche_pieces_jointes WHERE demarche_id = $1 ORDER BY uploaded_at ASC',
      [id]
    );

    return res.json({
      demarche,
      document: doc.rows[0] || null,
      pieces_jointes: pieces.rows,
      timeline: timeline.rows,
    });
  } catch (err) {
    console.error('getDemarcheTimeline error:', err);
    return res.status(500).json({ detail: 'Erreur serveur. Veuillez réessayer.' });
  }
};

module.exports = { createDemarche, getMyDemarches, getAllDemarches, updateDemarcheStatus, getDemarcheTimeline };
