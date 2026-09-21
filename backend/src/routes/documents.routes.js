const router = require('express').Router();
const upload = require('../middleware/upload');
const { authenticate, isAdmin } = require('../middleware/auth');
const {
  getDomaines, createDomaine, deleteDomaine,
  getDocuments, getDocument, createDocument, updateDocument, deleteDocument,
  updateStatus, incrementDocumentVisit, incrementDocumentTelechargement,
  getDocumentRelations, createDocumentRelation, deleteDocumentRelation,
  getMostVisitedDocuments, getDocumentStats, getDocumentStatsAPI, getSuggestions,
  getActualites, getActualite, createActualite, updateActualite, deleteActualite,
  getRemarks, createRemark, deleteRemark,
} = require('../controllers/documents.controller');

// ─── DOMAINES ────────────────────────────────────────────────────────────────
router.get('/domaines/', getDomaines);
router.post('/domaines/', authenticate, isAdmin, createDomaine);
router.delete('/domaines/:id/', authenticate, isAdmin, deleteDomaine);

// ─── DOCUMENTS ───────────────────────────────────────────────────────────────
router.get('/documents/', getDocuments);
router.post('/documents/', authenticate, isAdmin, upload.single('fichier'), createDocument);
router.get('/documents/:id/', getDocument);
router.put('/documents/:id/', authenticate, isAdmin, upload.single('fichier'), updateDocument);
router.patch('/documents/:id/', authenticate, isAdmin, upload.single('fichier'), updateDocument);
router.delete('/documents/:id/', authenticate, isAdmin, deleteDocument);
router.patch('/documents/:id/status/', authenticate, isAdmin, updateStatus);
router.get('/documents/:id/relations/', getDocumentRelations);
router.post('/documents/:id/relations/', authenticate, isAdmin, createDocumentRelation);
router.delete('/document-relations/:id/', authenticate, isAdmin, deleteDocumentRelation);
router.post('/documents/:document_id/visit/', incrementDocumentVisit);
router.post('/documents/:document_id/telechargement/', incrementDocumentTelechargement);

// ─── STATS & SUGGESTIONS ─────────────────────────────────────────────────────
router.get('/most-visited/', getMostVisitedDocuments);
router.get('/document-stats/', getDocumentStats);
router.get('/documents-stats/', getDocumentStatsAPI);
router.get('/suggestions/', getSuggestions);

// ─── ACTUALITES ───────────────────────────────────────────────────────────────
router.get('/actualites/', getActualites);
router.post('/actualites/', authenticate, isAdmin, createActualite);
router.get('/actualites/:id/', getActualite);
router.put('/actualites/:id/', authenticate, isAdmin, updateActualite);
router.patch('/actualites/:id/', authenticate, isAdmin, updateActualite);
router.delete('/actualites/:id/', authenticate, isAdmin, deleteActualite);

// ─── REMARKS ─────────────────────────────────────────────────────────────────
router.get('/remarks/', getRemarks);
router.post('/remarks/', createRemark);
router.delete('/remarks/:id/', authenticate, isAdmin, deleteRemark);

module.exports = router;
