import { expect, test, type Page } from '@playwright/test';

async function skipOnboarding(page: Page) {
  await page.goto('#/');
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('onboarding-next').click();
  await page.getByTestId('level-800').click();
}

async function move(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click({ force: true });
  await page.locator(`[data-square="${to}"]`).click({ force: true });
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
  // Heatmap : f7 est attaquée par le Bleu (dame + fou) ; la case porte un calque.
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
  await move(page, 'e2', 'e4');
  // Le bot (Rouge) doit jouer dans les 30 s (chargement du moteur inclus).
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-fen', / w /, { timeout: 30_000 });
  const rows = page.getByTestId('move-list');
  await expect(rows).toContainText('1.');
  // Passage hors ligne : le moteur déjà chargé continue de jouer.
  await context.setOffline(true);
  await move(page, 'd2', 'd4');
  await expect(page.locator('[data-testid="board"]')).toHaveAttribute('data-fen', / w /, { timeout: 30_000 });
  await page.getByTestId('resign').click();
  await expect(page.getByTestId('status')).toContainText('Abandon');
  await page.getByTestId('go-debrief').click();
  await expect(page.getByTestId('accuracy')).toBeVisible({ timeout: 90_000 });
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
