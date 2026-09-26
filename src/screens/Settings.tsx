import { useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { db } from '../data/db';
import { allGamesPgn, backupFileName, downloadOrShare, exportBackup, importBackup, parseBackup, serializeBackup, type ImportReport } from '../data/backup';
import { encryptText } from '../data/crypto';
import { HEATMAP_MODES } from '../board/ThreatOverlay';
import { useInstallPrompt } from '../app/installPrompt';

export function SettingsScreen() {
  const { settings, update } = useSettings();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const { canInstall, installed, install } = useInstallPrompt();

  const doExport = async () => {
    const b = await exportBackup(db);
    await downloadOrShare(backupFileName(), serializeBackup(b));
    await update({ lastBackupAt: Date.now(), gamesSinceBackup: 0 });
  };
  const doExportPgn = async () => {
    const games = await db.games.toArray();
    await downloadOrShare('bluered-parties.pgn', allGamesPgn(games), 'application/x-chess-pgn');
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const data = parseBackup(await f.text());
      setReport(await importBackup(db, data));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveKey = async () => {
    if (!apiKeyInput.trim()) {
      await update({ apiKey: undefined });
      return;
    }
    await update({ apiKey: await encryptText(apiKeyInput.trim()) });
    setApiKeyInput('');
  };
  const resetAll = async () => {
    if (!confirm('Effacer toutes les parties, analyses, profil et plan ? Cette action est irréversible. Exporte une sauvegarde avant.')) return;
    await db.delete();
    location.reload();
  };

  const Toggle = ({ k, label }: { k: keyof typeof settings; label: string }) => (
    <label className="field">
      <span>{label}</span>
      <input type="checkbox" checked={Boolean(settings[k])} onChange={(e) => void update({ [k]: e.target.checked })} />
    </label>
  );

  return (
    <div className="stack">
      <h1>Réglages</h1>
      <div className="card">
        <h3>Affichage</h3>
        <label className="field">
          <span>Palette</span>
          <select value={settings.theme} onChange={(e) => void update({ theme: e.target.value as 'bluered' | 'colorblind' })}>
            <option value="bluered">Bleu / Rouge</option>
            <option value="colorblind">Bleu / Orange (daltonisme)</option>
          </select>
        </label>
        <Toggle k="hatching" label="Motifs hachurés sur les cases attaquées" />
        <label className="field">
          <span>Intensité de la heatmap ({settings.heatmapIntensity.toFixed(1)})</span>
          <input type="range" min={0.5} max={1.5} step={0.1} value={settings.heatmapIntensity} onChange={(e) => void update({ heatmapIntensity: parseFloat(e.target.value) })} />
        </label>
        <label className="field">
          <span>Mode de heatmap par défaut</span>
          <select value={settings.defaultHeatmapMode} onChange={(e) => void update({ defaultHeatmapMode: e.target.value as typeof settings.defaultHeatmapMode })}>
            {HEATMAP_MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.key} · {m.label}
              </option>
            ))}
          </select>
        </label>
        <Toggle k="showCounts" label="Chiffres d'attaquants dans les coins" />
        <Toggle k="showHanging" label="Anneau pulsant sur les pièces en prise" />
        <Toggle k="showLoose" label="Triangle sur les pièces non défendues (pendantes)" />
        <Toggle k="ignorePinned" label="Mode réaliste : ignorer les pièces clouées" />
        <Toggle k="xray" label="Rayons X (batteries) dans la heatmap" />
        <Toggle k="sounds" label="Sons" />
        <Toggle k="animations" label="Animations" />
      </div>
      <div className="card">
        <h3>Partie et analyse</h3>
        <Toggle k="allowUndo" label="Autoriser « Annuler » contre les bots" />
        <Toggle k="showEvalBar" label="Mini barre d'évaluation pendant la partie (peut « tricher »)" />
        <label className="field">
          <span>Profondeur d'analyse ({settings.analysisDepth}) : 12 sur mobile, 16 sur ordinateur</span>
          <input type="range" min={8} max={20} step={1} value={settings.analysisDepth} onChange={(e) => void update({ analysisDepth: parseInt(e.target.value, 10) })} />
        </label>
      </div>
      <div className="card">
        <h3>Sauvegarde et restauration</h3>
        <p className="muted small">
          Toutes tes données vivent dans ce navigateur. Exporte un fichier pour changer d'appareil ou te protéger d'une perte. Dernière sauvegarde :{' '}
          {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString('fr-FR') : 'jamais'} · {settings.gamesSinceBackup} partie(s) depuis.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" data-testid="export-backup" onClick={() => void doExport()}>
            Exporter la sauvegarde (JSON)
          </button>
          <button type="button" className="btn" onClick={() => void doExportPgn()}>
            Exporter toutes les parties (PGN)
          </button>
          <label className="btn">
            Importer une sauvegarde
            <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void doImport(e.target.files?.[0])} />
          </label>
        </div>
        {report && (
          <p className="small" data-testid="import-report">
            Import terminé : {report.gamesAdded} partie(s), {report.analysesAdded} analyse(s), {report.plansAdded} plan(s) ajoutés ; {report.skipped} doublon(s) ignoré(s).
          </p>
        )}
        {error && <p style={{ color: 'var(--red-2)' }}>{error}</p>}
      </div>
      <div className="card">
        <h3>Coach par IA (optionnel)</h3>
        <p className="muted small">
          Sans clé, le coach par règles reste actif. Avec ta propre clé (Anthropic ou API compatible OpenAI), seuls les moments clés (FEN, coups, évaluations) sont envoyés, jamais la partie entière. La clé est chiffrée localement, exclue des sauvegardes, et peut être lue par toute extension ayant accès à cette page.
        </p>
        <label className="field">
          <span>Fournisseur</span>
          <select value={settings.apiProvider ?? 'anthropic'} onChange={(e) => void update({ apiProvider: e.target.value as 'anthropic' | 'openai' })}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">Compatible OpenAI</option>
          </select>
        </label>
        <label className="field">
          <span>Modèle (optionnel)</span>
          <input type="text" value={settings.apiModel ?? ''} placeholder={settings.apiProvider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-5'} onChange={(e) => void update({ apiModel: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>URL de base (optionnel)</span>
          <input type="text" value={settings.apiBaseUrl ?? ''} placeholder="https://api.anthropic.com" onChange={(e) => void update({ apiBaseUrl: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Clé API {settings.apiKey ? '(enregistrée)' : '(aucune)'}</span>
          <input type="password" value={apiKeyInput} placeholder="sk-…" onChange={(e) => setApiKeyInput(e.target.value)} />
        </label>
        <div className="btn-row">
          <button type="button" className="btn btn-sm" onClick={() => void saveKey()}>
            {apiKeyInput ? 'Enregistrer la clé' : 'Supprimer la clé'}
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Application</h3>
        <p className="small">
          Version <strong data-testid="version">{__APP_VERSION__}</strong> · <a href="#/a-propos">À propos et licences</a>
        </p>
        {installed ? (
          <p className="small tag tag-ok">Application installée</p>
        ) : canInstall ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void install()}>
            Installer l'application
          </button>
        ) : null}
        <p className="muted small">Installation : Chrome/Edge → icône « Installer » dans la barre d'adresse ; Android → « Ajouter à l'écran d'accueil » ; iPhone → Partager → « Sur l'écran d'accueil » (recommandé : Safari peut effacer les données d'un site non installé après 7 jours).</p>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void resetAll()}>
          Effacer toutes les données
        </button>
      </div>
    </div>
  );
}
