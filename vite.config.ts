import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Nom du dépôt GitHub : l'application est servie sous https://<user>.github.io/bluered_chess/
const REPO_BASE = process.env.VITE_BASE ?? '/bluered_chess/';

export default defineConfig({
  base: REPO_BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'engine/*.js', 'engine/*.wasm'],
      manifest: {
        name: 'BlueRed Chess',
        short_name: 'BlueRed',
        description: "Échecs d'entraînement Bleu contre Rouge : bots 800-1800, heatmap d'attaques, coach hors ligne.",
        lang: 'fr',
        start_url: REPO_BASE + '#/',
        scope: REPO_BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#12151c',
        theme_color: '#1E5AA8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Le moteur (.wasm ~1,8 Mo) doit être pré-caché pour jouer hors ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: REPO_BASE + 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
