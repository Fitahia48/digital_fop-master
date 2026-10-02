import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
  // Comptage des visites (table analytique `visits`, hors content-type — D7)
  'global::track-visit',
  // Parse les champs texte d'un corps multipart en JSON (démarches avec pièces)
  'global::multipart-json',
];

/**
 * CORS : le front envoie les cookies (withCredentials) → l'en-tête
 * Access-Control-Allow-Origin: * est refusé par les navigateurs dans ce cas.
 * Il faut des origines explicites (Vite dev 5173 + FRONTEND_URL).
 */
const corsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

// Réinjection du middleware cors avec sa configuration (même nom : remplace l'entrée)
(config as any).splice(config.indexOf('strapi::cors'), 1, {
  name: 'strapi::cors',
  config: {
    origin: corsOrigins,
    credentials: true,
  },
});

export default config;
