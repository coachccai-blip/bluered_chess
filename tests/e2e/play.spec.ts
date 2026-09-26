import { expect, test, type Page } from '@playwright/test';

async function skipOnboarding(page: Page) {
  await page.goto('#/');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('level-800').click();
}

async function move(page: Page, from: string, to: string, confirmRisky = true) {
  await page.locator(`[data-square="${from}"]`).click({ force: true });
  await page.locator(`[data-square="${to}"]`).click({ force: true });
  // Filet anti-gaffe : les tests jouent volontairement des coups douteux, on confirme.
  if (confirmRisky) {
    const play = page.getByTestId('blunder-play');
    if (await play.isVisible({ timeout: 300 }).catch(() => false)) await play.click();
  }
}

test('partie humain contre humain jusqu\'au mat, heatmap et sauvegarde', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('mode-human').click();
  await page.getByTestId('start-game').click();
  // Mat du berger : 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
  const seq = [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7'],
  ];
  for (const [f, t] of seq) await move(page, f, t);
  await expect(page.getByTestId('status')).toContainText('Échec et mat');
  await expect(page.getByTestId('move-list')).toContainText('Qxf7#');
  // Ouverture reconnue et affichée pendant la partie.
  await expect(page.getByTestId('opening-live')).toContainText('Partie du fou');
  // Heatmap : f7 est attaquée par le Bleu (dame + fou) ; la case porte un calque en mode « Tout ».
  await page.locator('[data-heatmode="A"]').click();
  await expect(page.locator('[data-heat="f7"]')).toHaveAttribute('data-blue', /[1-9]/);
  // Mode « Masquer » retire le calque ; raccourci clavier A le remet.
  await page.locator('[data-heatmode="H"]').click();
  await expect(page.locator('[data-heat="f7"]')).toHaveCount(0);
  await page.keyboard.press('a');
  await expect(page.locator('[data-heat="f7"]')).toHaveCount(1);
  // La partie est enregistrée dans l'historique.
  await page.goto('#/historique');
  await expect(page.getByTestId('game-list')).toContainText('1-0');
});

test('promotion avec fenêtre de choix', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('mode-human').click();
  await page.getByTestId('start-game').click();
  // 1.a4 b5 2.axb5 a6 3.bxa6 Nc6 4.axb7 Nb8 5.bxa8=Q
  const seq = [['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'], ['b5', 'a6'], ['c8', 'b7'], ['a6', 'b7'], ['b8', 'c6'], ['b7', 'a8']];
  for (const [f, t] of seq) await move(page, f, t);
  await page.locator('[data-promotion="q"]').click();
  await expect(page.getByTestId('move-list')).toContainText('bxa8=Q');
});

test('le bot 800 répond et la partie est analysable, y compris hors ligne', async ({ page, context }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('color-w').click();
  await page.getByTestId('start-game').click();
  // Barre d'avantage visible par défaut, masquable et réaffichable.
  await expect(page.getByTestId('evalbar')).toBeVisible();
  await page.getByTestId('evalbar-toggle').click();
  await expect(page.getByTestId('evalbar')).toHaveCount(0);
  await page.getByTestId('evalbar-toggle').click();
  await expect(page.getByTestId('evalbar')).toBeVisible();
  await move(page, 'e2', 'e4');
  // Commentaire en direct du coach sur mon coup.
  await expect(page.getByTestId('live-comment')).toContainText('Tu joues e4');
  // Le bot (Rouge) doit jouer dans les 30 s (chargement du moteur inclus).
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-fen', / w /, { timeout: 30_000 });
  const rows = page.getByTestId('move-list');
  await expect(rows).toContainText('1.');
  // Passage hors ligne : le moteur déjà chargé continue de jouer.
  await context.setOffline(true);
  await move(page, 'd2', 'd4');
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-fen', / w /, { timeout: 30_000 });
  // La barre reçoit une évaluation chiffrée du moteur.
  await expect(page.getByTestId('evalbar')).toHaveAttribute('data-cp', /-?\d+/, { timeout: 30_000 });
  await page.getByTestId('resign').click();
  await expect(page.getByTestId('status')).toContainText('Abandon');
  // On masque la barre de la partie : celle du débrief doit rester visible (réglage indépendant).
  await page.getByTestId('evalbar-toggle').click();
  await page.getByTestId('go-debrief').click();
  await expect(page.getByTestId('evalbar')).toBeVisible();
  await expect(page.getByTestId('accuracy')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('evalbar')).toHaveAttribute('data-cp', /-?\d+/);
  await page.getByTestId('debrief-evalbar-toggle').click();
  await expect(page.getByTestId('evalbar')).toHaveCount(0);
  await page.getByTestId('debrief-evalbar-toggle').click();
  await expect(page.getByTestId('evalbar')).toBeVisible();
  // Commentaire de chaque coup dans le débrief et bouton de lecture.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('move-comment')).toContainText('Ouverture : Ouverture du pion roi. Tu joues e4');
  await expect(page.getByTestId('opening-name')).toBeVisible();
  await expect(page.getByTestId('read-game')).toBeVisible();
  await context.setOffline(false);
});

test('réglages : export de sauvegarde et version', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/reglages');
  await expect(page.getByTestId('version')).not.toBeEmpty();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/bluered-chess-.*\.json/);
});

test('exercice de visualisation à l\'aveugle', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/entrainement');
  await page.getByTestId('ex-knight').click();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('blindfold-score')).toContainText('%');
});

test('la partie en cours survit à un rechargement et se consulte coup par coup', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('mode-human').click();
  await page.getByTestId('start-game').click();
  await move(page, 'e2', 'e4');
  await move(page, 'e7', 'e5');
  await page.reload();
  await expect(page.getByTestId('move-list')).toContainText('e5');
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-fen', / w /);
  // Bouton « Reprendre » sur l'accueil.
  await page.goto('#/');
  await expect(page.getByTestId('resume-game')).toBeVisible();
  await page.getByTestId('resume-game').click();
  await expect(page.getByTestId('review-bar')).toBeVisible();
  // Consultation d'une position précédente : l'échiquier devient lecture seule, puis retour au direct.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-fen', / b /);
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-movable', '');
  await page.getByTestId('back-live').click();
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-movable', 'wb');
  await move(page, 'g1', 'f3');
  await expect(page.getByTestId('move-list')).toContainText('Nf3');
  // Mode « Pièce seule » : survoler le cavalier f3 allume ses cases (e5, g5, d4, h4...).
  await page.locator('[data-heatmode="P"]').click();
  await page.locator('[data-square="f3"]').hover({ force: true });
  await expect(page.locator('[data-heat="e5"]')).toHaveAttribute('data-blue', '1');
  await expect(page.locator('[data-heat="a3"]')).toHaveCount(0);
});

test('voix HD : catalogue, Worker de synthèse et erreur réseau propre', async ({ page, context }) => {
  await skipOnboarding(page);
  // Les modèles viennent de huggingface.co : on simule un réseau coupé vers ce domaine.
  await context.route('https://huggingface.co/**', (route) => route.abort());
  await page.goto('#/reglages');
  await expect(page.getByTestId('hd-voices')).toBeVisible();
  const row = page.getByTestId('hd-voice-fr_FR-siwis-low');
  await expect(row).toContainText('28 Mo');
  await row.getByRole('button', { name: 'Télécharger' }).click();
  await expect(page.getByTestId('hd-voices')).toContainText('Téléchargement impossible', { timeout: 30_000 });
  // Les fichiers moteur sont servis par l'application.
  const ort = await page.request.get('tts/ort/ort-wasm-simd-threaded.wasm');
  expect(ort.status()).toBe(200);
  const piper = await page.request.get('tts/piper/piper_phonemize.wasm');
  expect(piper.status()).toBe(200);
});

test('flèches et cases marquées comme sur chess.com', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('mode-human').click();
  await page.getByTestId('start-game').click();
  // Clic droit : marque la case e4.
  await page.locator('[data-square="e4"]').click({ button: 'right', force: true });
  await expect(page.locator('[data-usermark="e4"]')).toHaveCount(1);
  // Clic droit glissé g1 -> f3 : flèche (l'échiquier doit être entièrement visible pour un vrai glisser).
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.getByTestId('board').scrollIntoViewIfNeeded();
  const g1 = await page.locator('[data-square="g1"]').boundingBox();
  const f3 = await page.locator('[data-square="f3"]').boundingBox();
  await page.mouse.move(g1!.x + g1!.width / 2, g1!.y + g1!.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(f3!.x + f3!.width / 2, f3!.y + f3!.height / 2, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('[data-userarrow="g1f3"]')).toHaveCount(1);
  // Clic gauche dans le vide (case sans pièce) : tout disparaît.
  await page.locator('[data-square="d5"]').click({ force: true });
  await expect(page.locator('[data-usermark="e4"]')).toHaveCount(0);
  await expect(page.locator('[data-userarrow="g1f3"]')).toHaveCount(0);
  // Mode crayon : clic gauche marque, la pièce n'est pas sélectionnée.
  await page.getByTestId('draw-toggle').click();
  await page.locator('[data-square="e2"]').click({ force: true });
  await expect(page.locator('[data-usermark="e2"]')).toHaveCount(1);
  await expect(page.locator('[data-dest]')).toHaveCount(0);
  await page.getByTestId('draw-toggle').click();
  // Le jeu fonctionne toujours après désactivation du crayon.
  await move(page, 'e2', 'e4');
  await expect(page.getByTestId('move-list')).toContainText('e4');
});

test('filet anti-gaffe : confirmation avant un coup qui perd du matériel', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('mode-human').click();
  await page.getByTestId('start-game').click();
  for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['d7', 'd6']]) await move(page, f, t);
  // Cxe5?? perd le cavalier contre un pion : le coach demande confirmation.
  await move(page, 'f3', 'e5', false);
  await expect(page.getByTestId('blunder-check')).toBeVisible();
  await page.getByTestId('blunder-rethink').click();
  await expect(page.getByTestId('move-list')).not.toContainText('Nxe5');
  await move(page, 'f3', 'e5', false);
  await page.getByTestId('blunder-play').click();
  await expect(page.getByTestId('move-list')).toContainText('Nxe5');
});

test('révisions du jour et mode devine le coup après une partie analysée', async ({ page }) => {
  await skipOnboarding(page);
  await page.goto('#/partie');
  await page.getByTestId('mode-human').click();
  await page.getByTestId('start-game').click();
  // Mat du berger subi par le Bleu ? Non : le Bleu (joueur) fait des erreurs : 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7# — le joueur est Bleu et gagne ; jouons plutôt une gaffe du Bleu : 1.f3 e5 2.g4 Qh4#.
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) await move(page, f, t);
  await move(page, 'd8', 'h4');
  await expect(page.getByTestId('status')).toContainText('Échec et mat');
  await page.getByTestId('go-debrief').click();
  await expect(page.getByTestId('accuracy')).toBeVisible({ timeout: 90_000 });
  // Devine le coup : proposer 1.e4 à la place de 1.f3.
  await page.getByTestId('guess-toggle').click();
  await move(page, 'e2', 'e4');
  await expect(page.getByTestId('guess-feedback')).toBeVisible({ timeout: 30_000 });
  // Fiches de révision créées pour les erreurs du Bleu.
  await page.goto('#/entrainement');
  await expect(page.getByTestId('drills')).toContainText('Réviser');
});
