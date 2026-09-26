# BlueRed Chess

Application web d'échecs d'entraînement, **gratuite, open source (GPL v3), 100 % locale et hors ligne**.

- 21 bots calibrés de **800 à 1800 Elo** (Stockfish 19 lite en WebAssembly, dans un Web Worker).
- Échiquier **Bleu contre Rouge** (le Bleu joue en premier), règles FIDE complètes via chess.js.
- **Heatmap d'attaques** en temps réel : chaque case est teintée selon le camp qui l'attaque et le nombre d'attaquants (modes A/B/R/C/P/H/X).
- **Débrief** de chaque partie : gaffes, coup meilleur, motifs (pièce en prise, fourchette, clouage…), phrases en français.
- **Profil de faiblesses** (radar à 7 axes), Elo maison, **plan d'entraînement** et exercices intégrés.
- **PWA** installable sur ordinateur et téléphone, utilisable sans connexion (moteur pré-caché).
- Données dans IndexedDB, **sauvegarde/restauration** par fichier JSON, export PGN.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173/bluered_chess/
npm test           # tests unitaires (Vitest)
npm run build      # typage + build de production dans dist/
npm run test:e2e   # tests Playwright (après npm run build)
npm run calibrate  # calibration des bots (local, long)
```

Le moteur (`stockfish-19-lite-single.js` + `.wasm`, ~1,8 Mo) est copié automatiquement de `node_modules` vers `public/engine/` avant `dev` et `build`.

## Publication sur GitHub Pages

1. Dépôt public, **Settings → Pages → Source : GitHub Actions**.
2. Pousser sur `main` : le workflow `.github/workflows/deploy.yml` teste, construit et déploie.
3. L'application est servie sous `https://<utilisateur>.github.io/bluered_chess/` (base Vite `/bluered_chess/`, modifiable par la variable `VITE_BASE`).

## Licence

GPL v3. Stockfish et stockfish.js sont sous GPL v3 ; chess.js sous BSD-2-Clause. Voir l'écran « À propos ».
