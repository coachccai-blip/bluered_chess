import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Nom du dépôt GitHub : l'application est servie sous https://<user>.github.io/bluered_chess/
const REPO_BASE = process.env.VITE_BASE ?? '/bluered_chess/';

/**
 * onnxruntime-web référence son .wasm via import.meta.url, ce qui fait émettre à Vite une copie de 14 Mo dans
 * dist/assets. Nous servons ce fichier depuis public/tts/ort/ (wasmPaths), la copie est donc retirée du bundle.
 */
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: 'bluered-drop-duplicate-ort-wasm',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
    },
  };
}

export default defineConfig({
  base: REPO_BASE,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    dropDuplicateOrtWasm(),
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
        // Les fichiers de la voix HD (~33 Mo) ne sont pas pré-cachés : ils sont mis en cache à la demande.
        globIgnores: ['tts/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/tts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'bluered-tts', expiration: { maxEntries: 8 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
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
