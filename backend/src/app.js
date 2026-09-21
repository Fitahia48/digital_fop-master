require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth.routes');
const documentsRoutes = require('./routes/documents.routes');
const corpsRoutes = require('./routes/corps.routes');
const visitsRoutes = require('./routes/visits.routes');
const appratingRoutes = require('./routes/apprating.routes');
const searchRoutes = require('./routes/search.routes');
const organigrammeRoutes = require('./routes/organigramme.routes');
const subscribersRoutes = require('./routes/subscribers.routes');
const demarchesRoutes = require('./routes/demarches.routes');
const favorisRoutes = require('./routes/favoris.routes');
const faqRoutes = require('./routes/faq.routes');
const transparenceRoutes = require('./routes/transparence.routes');
const { trackVisit } = require('./controllers/visits.controller');

const app = express();
const PORT = process.env.PORT || 8000;

// Ensure media folders exist
const mediaDir = path.join(__dirname, '../media');
const documentsDir = path.join(mediaDir, 'documents');
const corpsDir = path.join(mediaDir, 'corps');
[mediaDir, documentsDir, corpsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Middlewares globaux
app.use(
  cors({
    origin: true, // Autorise toutes les origines en développement (Vite: 5173, etc.)
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques (media uploads)
app.use('/media', express.static(mediaDir));

// Middleware de comptage des visites
app.use(trackVisit);

// Routes d'authentification (compatibilité Djoser / Django)
app.use('/api/v1/auth', authRoutes);

// Routes métier sous /api
app.use('/api', documentsRoutes);
app.use('/api', corpsRoutes);
app.use('/api', visitsRoutes);
app.use('/api', appratingRoutes);
app.use('/api', searchRoutes);
app.use('/api', organigrammeRoutes);
app.use('/api', subscribersRoutes);
app.use('/api', demarchesRoutes);
app.use('/api', favorisRoutes);
app.use('/api', faqRoutes);
app.use('/api', transparenceRoutes);

// Routes directes (pour compatibilité avec certains appels sans préfixe /api)
app.use('/', visitsRoutes);
app.use('/', appratingRoutes);

// Endpoint racine
app.get('/', (req, res) => {
  res.json({
    name: 'Digital FOP API',
    version: '1.0.0',
    status: 'running',
    database: 'PostgreSQL (digitallibrary_db1)',
  });
});

// Middleware 404
app.use((req, res) => {
  res.status(404).json({ detail: `Route introuvable: ${req.method} ${req.originalUrl}` });
});

// Middleware de gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Erreur serveur interne',
  });
});

// Démarrage du serveur si exécuté directement
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  Serveur Express démarré sur le port ${PORT}`);
    console.log(`  API Base URL: http://localhost:${PORT}`);
    console.log(`  Media URL:    http://localhost:${PORT}/media/`);
    console.log(`========================================`);
  });
}

module.exports = app;
