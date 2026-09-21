import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Le nouveau service worker prend le relais automatiquement après déploiement
      registerType: 'autoUpdate',
      // Enregistrement injecté automatiquement dans index.html (pas de code client requis)
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Bibliothèque Numérique MTeFOP',
        short_name: 'Biblio MTeFOP',
        description:
          "Bibliothèque numérique du Ministère du Travail, de l'Emploi et de la Fonction Publique (MTeFOP).",
        lang: 'fr',
        theme_color: '#1e3a8a',
        background_color: '#1e3a8a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // Assets statiques précachés (JS, CSS, polices, icônes de l'app).
        // Les images volumineuses de public/ (actualités, pages marketing)
        // sont volontairement exclues : elles ne font pas partie du shell.
        globPatterns: [
          '**/*.{js,css,html,ico,svg,webp,woff,woff2,ttf,eot}',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'apple-touch-icon.png',
        ],
        // Garde-fou : aucune entrée précachée ne doit dépasser 3 Mo
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Aucune route API ne doit être servie comme fallback de navigation
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Fichiers de traduction : cache-first (peu changeants)
            urlPattern: ({ url }) => url.pathname.includes('/locales/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'locales-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Consultation des documents et actualités : network-first avec repli cache.
            // Volontairement limité à ces endpoints : les routes d'auth, de démarches
            // et de recherche ne sont jamais mises en cache (données sensibles/volatiles).
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              /\/api\/(documents|actualites)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-documents-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      // Le service worker reste désactivé en dev pour ne pas gêner le HMR
      devOptions: { enabled: false },
    }),
  ],
})
