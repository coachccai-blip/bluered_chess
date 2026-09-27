# BlueRed Chess — contexte pour Claude Code

Application web d'échecs d'entraînement **Bleu contre Rouge**, gratuite, open source (GPL v3), 100 % côté client,
publiée sur GitHub Pages, installable en PWA et utilisable hors ligne. Ce fichier résume le cahier des charges
(brief d'origine, sections 1 à 13) et les conventions du dépôt.

## Commandes

```bash
npm run dev        # serveur de développement (copie le moteur dans public/engine avant)
npm test           # tests unitaires Vitest (tests/unit)
npm run typecheck  # tsc --noEmit
npm run build      # typage + build de production (dist/)
npm run test:e2e   # Playwright (utilise vite preview sur le port 4173)
npm run calibrate  # scripts/calibrate.ts : estime l'Elo des bots en local (long)
node scripts/make-icons.mjs  # régénère les PNG d'icônes depuis public/icons/icon.svg
```

## Règles du dépôt

- **Logique d'échecs pure** dans `src/chess/` et `src/analysis/` : TypeScript sans React ni DOM, testée.
- Les couleurs internes restent `w`/`b` (chess.js) ; seule la couche d'affichage (`src/board/theme.ts`) traduit en
  **Bleu** (joue en premier) et **Rouge**. Le PGN conserve Blancs/Noirs pour rester compatible Lichess/chess.com.
- Une seule source de vérité : le FEN courant + l'historique dans `src/store/gameStore.ts` ; échiquier, heatmap et
  moteur en dérivent. Le store est persisté dans localStorage (`bluered-current-game`) pour reprendre une partie.
- Les pièces de l'échiquier ont des identités stables (`nextPieceIds` dans `Board.tsx`) pour animer le glissement ;
  la transformation est en CSS, pas en attribut SVG.
- Le mode `exercise` du store se joue contre le bot comme le mode `bot`, avec retour sur le meilleur coup attendu.
- Mode `explore` : le joueur joue les deux camps, rien n'est enregistré ; après chaque coup, évaluation à profondeur 12,
  commentaire de position neutre (`explorationComment`), meilleur coup avec flèche verte et bouton « Jouer le meilleur coup »,
  position de départ FEN facultative ; « Explorer d'ici » depuis le débrief.
- Cadences (`TimeControl` : unlimited par défaut, rapid 10 min, blitz 5 min) : pendules dans le store (`clocks`, `tick`),
  perte au temps (`reason: 'timeout'`), un classement par cadence (`Profile.ratings`, `progress/ratings.ts`) ; les champs
  `estimatedElo`/`eloHistory`/`streak`/`recommendedBotElo` reflètent la cadence illimitée. La fenêtre « Nouvelle partie »
  propose par défaut le bot recommandé de la cadence choisie.
- Annotations façon chess.com dans `Board.tsx` : clic droit = marquer, clic droit glissé = flèche (Maj/Alt/Ctrl changent la
  couleur), appui long sur mobile, bouton crayon pour dessiner au clic gauche ; clic gauche ou Échap efface.
- Barre d'avantage verticale (`EvalBarVertical`) à gauche de l'échiquier, réglage `showEvalBar` (vrai par défaut), bouton
  d'affichage/masquage dans la partie ; évaluation moteur à profondeur 10 après chaque coup.
- Le moteur Stockfish lite mono-thread tourne dans un Web Worker (`src/engine/engineClient.ts`) avec une file
  d'attente ; jamais d'appel concurrent. Aucun en-tête COOP/COEP n'est disponible sur GitHub Pages.
- Coût zéro, aucun serveur, aucune clé obligatoire. Toutes les données vivent dans IndexedDB (Dexie).
  Sauvegarde/restauration par fichier JSON avec fusion par identifiant (rien n'est écrasé).
- Routage à hash (`#/partie`, `#/debrief/:id`, `#/historique`, `#/entrainement`, `#/reglages`, `#/a-propos`).
- Tests avant la logique (règles, attaques, classification). Un commit par étape, message en français.
- Licence GPL v3 (Stockfish). Crédits dans l'écran « À propos ».

## Structure

```
src/app        routes, layout, bannière de mise à jour PWA
src/board      Board.tsx (SVG, clic-clic et glisser-déposer), pieces.tsx, ThreatOverlay.tsx (heatmap), theme.ts
src/chess      game.ts (chess.js), attacks.ts (carte d'attaques maison), see.ts, types.ts, openings.ts (noms français, par position)
src/engine     engineClient.ts (UCI), botProfiles.ts (21 profils), bot.ts (softmax + gaffes), openingBook.ts
src/analysis   analyzeGame.ts, classify.ts, motifs.ts, coach.ts, phrases.ts, explain.ts (pourquoi « Mieux », commentaires), winprob.ts, llmCoach.ts (opt-in)
src/progress   elo.ts, profile.ts (7 indicateurs), trainingPlan.ts, exercises.ts
src/data       models.ts, db.ts (Dexie), backup.ts, crypto.ts, gameService.ts
src/screens    Dashboard, Play, Debrief, History, Training, Settings, About
src/ui         composants génériques (HeatmapToolbar, MoveList, BotSelector, EvalChart, Radar, Modal), speech.ts (voix)
tests/unit     Vitest ; tests/e2e Playwright
scripts        copy-engine.mjs (Stockfish + fichiers TTS), make-icons.mjs, calibrate.ts
```

## Spécifications clés

**Heatmap (section 5).** Une pièce attaque une case si elle pourrait y capturer ; les pions n'attaquent qu'en
diagonale ; une pièce clouée attaque quand même (option « réaliste » pour l'ignorer) ; la défense d'une pièce
alliée compte comme contrôle ; rayons X en option. Opacité : 1 attaquant 25 %, 2 → 45 %, 3 → 65 %, 4+ → 85 %.
Case contestée = diagonale bleu/rouge. Modes : A tout, B bleu, R rouge, C contestées, P pièce seule, H masquer,
X prévisualisation après mon coup. Pièce en prise = anneau pulsant ; pièce pendante = triangle (option).
La carte maison est validée contre `attackers()` de chess.js sur 30 FEN (tests/unit/attacks.test.ts).

**Bots (section 6).** 800–1300 : hybride Stockfish MultiPV + softmax de température T (cp) + taux de gaffe ;
1350–1800 : `UCI_LimitStrength` + `UCI_Elo` natif. Table dans `src/engine/botProfiles.ts` (à recalibrer avec
`npm run calibrate`). Livre d'ouverture réduit, traits de personnalité (agression, bruit matériel, faiblesse en
finale), délai de réflexion 0,5–2,5 s. Jamais de gaffe donnant mat en 1 au-dessus de 1200.

**Analyse et coach (section 7).** Éval par position (profondeur 16 ordinateur / 12 mobile), conversion en
probabilité de gain (logistique Lichess). Précision par coup = formule Lichess sur la perte de probabilité ; précision de
partie = `gameAccuracy` (`winprob.ts`) : moyenne pondérée par la volatilité (écart-type sur fenêtre glissante, comme Lichess et
la méthode CAPS de chess.com) combinée à la moyenne simple par moyenne harmonique. Elo de performance par partie
(`progress/performance.ts` : 60 % barème de précision + 40 % résultat contre le bot, précision seule sans adversaire noté),
stocké sur `Analysis.performanceElo`, affiché au débrief et à l'accueil. Catégories : excellent ≤ 2 %, bon ≤ 5 %, imprécision ≤ 10 %, erreur
≤ 20 %, gaffe > 20 %, mat raté. Motifs détectés sur la carte d'attaques : pièce en prise, capture gratuite ratée,
fourchette subie/ratée, clouage, roi au centre après le coup 15, coup dans une case rouge, échange perdant (SEE),
mat en 1–3 raté/encaissé, temps perdu. 3 à 5 moments clés + tournant, phrases modèles françaises par motif et
gravité (`phrases.ts`). Coach LLM optionnel avec la clé de l'utilisateur (moments clés seulement).

**Commentaires et voix.** `explain.ts` décrit chaque coup (capture, échec, roque, pièce sauvée/défendue, menace, développement)
et explique pourquoi le coup « Mieux » est meilleur (but du coup, réplique adverse après le coup joué, suite prévue, évaluations) ;
après un coup simplement « bon » du joueur, le meilleur coup est nommé et expliqué avec un ton doux (en direct comme au débrief).
`moveFeatures` affine le diagnostic « en prise » (`refineHanging`) : défenses par batterie (rayon X) comptées, cavalier/fou = échange
égal ; la phrase dit « pas protégé », « avec une pièce qui vaut moins » ou « pas assez défendu » selon le cas.
`analyzeGame` conserve la variante principale (`bestLine`) et la meilleure réplique (`threat`). `speech.ts` utilise la Web Speech API
et préfère la voix « Vivienne » (Microsoft, fr-FR) si elle est installée. Réglages : `voiceEnabled`, `voiceName`, `voiceRate`,
`liveComments` (off / descriptive / full), `autoReadDebrief`, `hdVoiceId`.
**Ouvertures.** `openings.ts` contient ~200 lignes ECO avec noms et variantes en français ; l'index est par position (transpositions
gérées). `openingAnnouncement(sans, ply)` renvoie la nouvelle reconnaissance à annoncer ; affichée en partie, en débrief et en historique.
Les explications du coup « Mieux » (`explainBest`) sont en mots simples, sans chiffres (`evalWords`), avec « ton/ta » et « son/sa ».
**Voix HD hors ligne.** `src/ui/hdVoice.worker.ts` fait tourner Piper (piper-tts-web + ONNX Runtime Web) dans un Worker ;
`hdVoice.ts` est le client (téléchargement avec progression, stockage OPFS, synthèse) ; `hdVoiceCatalog.ts` liste les voix
françaises. Les fichiers moteur (`public/tts/ort/`, `public/tts/piper/`, ~33 Mo) sont copiés par `scripts/copy-engine.mjs`,
exclus du pré-cache et mis en cache à la demande (Workbox CacheFirst). Les modèles viennent de huggingface.co
(`diffusionstudio/piper-voices`). `speak()` utilise la voix HD active, sinon la voix du navigateur. Fluidité : lecture **par phrase**
(la première phrase part dès qu'elle est prête, les suivantes se synthétisent pendant la lecture), file à priorité dans `hdVoice.ts`
(lecture = 10, pré-génération = 0), cache audio mémoire + IndexedDB (table `audio`, ~600 entrées max), `prefetchSpeech` pré-génère
les commentaires de tout le débrief à partir de la position affichée, `warmupSpeech` précharge le moteur 2,5 s après le démarrage.

**Apprentissage en jouant.** `analysis/risk.ts` : filet anti-gaffe (`assessMoveRisk`, réglage `blunderCheck` off / blunders / all)
qui demande confirmation avant un coup laissant une pièce en prise, une capture perdante ou un mat en 1 (jamais en mode exercice).
`progress/drills.ts` : répétition espacée des erreurs (table Dexie `drills`, boîtes de Leitner 1/3/7/14/30 jours, créées à
l'enregistrement d'une analyse, résultat enregistré au premier essai en mode exercice via `exerciseDrillId`). `progress/goals.ts` :
objectif de partie tiré du plan (`goalFor`, `evaluateGoal`) stocké sur la partie et vérifié à l'analyse ; `fastMistakes` compte les
erreurs jouées en moins de 3 s (temps par coup `thinkMs` dans les enregistrements, `thinkTimes` sur la partie). Débrief : mode
« Devine le coup » (échiquier jouable aux positions du joueur, proposition notée par le moteur).

**Indice en partie.** `analysis/hint.ts` (`buildHint`, `nullMoveFen`) : bouton « Indice » dans la partie (modes bot/humain/exercice, au trait du
joueur) avec trois niveaux progressifs — la pièce à jouer (case marquée), le coup (flèche jaune), puis l'explication complète (but du coup,
menace adverse parée grâce au coup nul, pourquoi les autres candidats MultiPV sont moins bons, évaluation en mots) affichée et lue par la voix.
Moteur : profondeur 12 MultiPV 3 + profondeur 8 sur la position « coup nul ». Le nombre d'indices (`hintsUsed` du store, `Game.hints`) est
affiché dans le débrief.

**Programmes par faiblesse.** `progress/weaknessGuide.ts` : pour chaque indicateur du radar, un programme (diagnostic chiffré, méthode
en partie, actions, routine) ; `rankWeaknesses` trie les faiblesses. `progress/launchAction.ts` lance une action (fiches de répétition
filtrées par motif, puzzles intégrés de `puzzles.ts` dont les solutions sont vérifiées par les tests, exercices de visualisation via
`#/entrainement?ex=…`, finales, partie avec objectif, lien Lichess). `ui/WeaknessPanel.tsx` est ouvert depuis le radar de l'accueil
(indicateurs cliquables, « Programmes prioritaires ») et depuis l'entraînement (« Entraînement par faiblesse »). En mode exercice, une
série de puzzles (`exerciseTheme`) propose « Puzzle suivant » ; tout coup qui mate est accepté pour une solution en « # ».

**Profil et plan (section 8).** Indicateurs sur les 20 dernières parties : pièces pendantes (> 3/100 coups),
tactiques ratées (> 4/100), sécurité du roi (> 20 % des parties), finales (< 75 % précision), ouverture (< 85 %),
cases rouges (> 5/100), gestion de l'avantage (> 25 %). Plan = 2 indicateurs les plus faibles × 3 exercices,
10 min/jour, recalculé toutes les 5 parties. Elo maison K = 32 ; bot recommandé +50 après 2 victoires, −50 après
2 défaites.

**PWA et données (section 10).** vite-plugin-pwa (Workbox, pré-cache incluant `.wasm`), bannière « Nouvelle
version », `navigator.storage.persist()`, rappel de sauvegarde toutes les 20 parties ou 30 jours, clé API chiffrée
localement et exclue des sauvegardes. Base Vite `/bluered_chess/` (variable `VITE_BASE`).

**Hors périmètre V1** : jeu en ligne, ouvertures encyclopédiques, blitz chronométré, applis natives, bots Maia.
