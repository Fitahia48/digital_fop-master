const router = require('express').Router();
const upload = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const {
  getDomaines, createDomaine, deleteDomaine,
  getDocuments, getDocument, createDocument, updateDocument, deleteDocument,
  updateStatus, incrementDocumentVisit, incrementDocumentTelechargement,
  getMostVisitedDocuments, getDocumentStats, getDocumentStatsAPI, getSuggestions,
  getActualites, getActualite, createActualite, updateActualite, deleteActualite,
  getRemarks, createRemark, deleteRemark,
} = require('../controllers/documents.controller');

// ─── DOMAINES ────────────────────────────────────────────────────────────────
router.get('/domaines/', getDomaines);
router.post('/domaines/', authenticate, createDomaine);
router.delete('/domaines/:id/', authenticate, deleteDomaine);

// ─── DOCUMENTS ───────────────────────────────────────────────────────────────
router.get('/documents/', getDocuments);
router.post('/documents/', authenticate, upload.single('fichier'), createDocument);
router.get('/documents/:id/', getDocument);
router.put('/documents/:id/', authenticate, upload.single('fichier'), updateDocument);
router.patch('/documents/:id/', authenticate, upload.single('fichier'), updateDocument);
router.delete('/documents/:id/', authenticate, deleteDocument);
router.patch('/documents/:id/status/', authenticate, updateStatus);
router.post('/documents/:document_id/visit/', incrementDocumentVisit);
router.post('/documents/:document_id/telechargement/', incrementDocumentTelechargement);

// ─── STATS & SUGGESTIONS ─────────────────────────────────────────────────────
router.get('/most-visited/', getMostVisitedDocuments);
router.get('/document-stats/', getDocumentStats);
router.get('/documents-stats/', getDocumentStatsAPI);
router.get('/suggestions/', getSuggestions);

// ─── ACTUALITES ───────────────────────────────────────────────────────────────
router.get('/actualites/', getActualites);
router.post('/actualites/', authenticate, createActualite);
router.get('/actualites/:id/', getActualite);
router.put('/actualites/:id/', authenticate, updateActualite);
router.patch('/actualites/:id/', authenticate, updateActualite);
router.delete('/actualites/:id/', authenticate, deleteActualite);

// ─── REMARKS ─────────────────────────────────────────────────────────────────
router.get('/remarks/', getRemarks);
router.post('/remarks/', createRemark);
router.delete('/remarks/:id/', authenticate, deleteRemark);

module.exports = router;
