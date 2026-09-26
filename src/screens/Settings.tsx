import { useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { db } from '../data/db';
import { allGamesPgn, backupFileName, downloadOrShare, exportBackup, importBackup, parseBackup, serializeBackup, type ImportReport } from '../data/backup';
import { encryptText } from '../data/crypto';
import { HEATMAP_MODES } from '../board/ThreatOverlay';
import { useInstallPrompt } from '../app/installPrompt';
import { Switch } from '../ui/Switch';
import { hasVivienne, speak, stopSpeaking, useSpeechStatus, useVoices } from '../ui/speech';
import { HdVoicePanel } from '../ui/HdVoicePanel';

export function SettingsScreen() {
  const { settings, update } = useSettings();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const { canInstall, installed, install } = useInstallPrompt();
  const { voices, supported: voiceSupported } = useVoices();
  const speechStatus = useSpeechStatus();
  const frVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('fr'));
  const otherVoices = voices.filter((v) => !v.lang.toLowerCase().startsWith('fr'));

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
    <div className="field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '.55rem 0', borderBottom: '1px solid var(--border)' }}>
      <span>{label}</span>
      <Switch checked={Boolean(settings[k])} label={label} onChange={(v) => void update({ [k]: v })} />
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Réglages</h1>
      </div>
      <div className="card">
        <h3>Affichage</h3>
        <label className="field">
          <span>Thème</span>
          <div className="segmented" role="radiogroup" aria-label="Thème">
            {(['system', 'light', 'dark'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={settings.themeMode === m} className={settings.themeMode === m ? 'active' : ''} onClick={() => void update({ themeMode: m })}>
                {m === 'system' ? 'Système' : m === 'light' ? 'Clair' : 'Sombre'}
              </button>
            ))}
          </div>
        </label>
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
      <div className="card" data-testid="voice-settings">
        <h3>Voix du coach</h3>
        <p className="muted small">
          Chaque coup est commenté et lu par la synthèse vocale du navigateur (gratuite, locale). La voix <strong>Vivienne</strong> (Microsoft, français) est utilisée automatiquement si elle est disponible : dans Edge (voix « Vivienne Online (Natural) », connexion requise) ou après installation dans Windows 11 (Paramètres → Accessibilité → Narrateur → Ajouter des voix naturelles), elle fonctionne alors hors ligne dans Edge et Chrome.
        </p>
        {!voiceSupported && <p className="small" style={{ color: 'var(--red-2)' }}>Ce navigateur ne propose pas de synthèse vocale.</p>}
        {voiceSupported && (
          <p className="small">
            {hasVivienne() ? <span className="tag tag-ok">Vivienne détectée</span> : <span className="tag tag-accent">Vivienne absente : voix française de remplacement</span>}{' '}
            <span className="muted">{frVoices.length} voix française(s) disponible(s).</span>
          </p>
        )}
        <Toggle k="voiceEnabled" label="Lire les commentaires à voix haute" />
        <HdVoicePanel />
        <label className="field">
          <span>Voix du navigateur (utilisée si aucune voix HD n'est active)</span>
          <select value={settings.voiceName ?? ''} onChange={(e) => void update({ voiceName: e.target.value || undefined })} data-testid="voice-select">
            <option value="">Automatique (Vivienne si présente)</option>
            {frVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} {v.local ? '' : '(en ligne)'}
              </option>
            ))}
            {otherVoices.length > 0 && <option disabled>— autres langues —</option>}
            {otherVoices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Vitesse ({settings.voiceRate.toFixed(1)})</span>
          <input type="range" min={0.6} max={1.6} step={0.1} value={settings.voiceRate} onChange={(e) => void update({ voiceRate: parseFloat(e.target.value) })} />
        </label>
        <label className="field">
          <span>Commentaires pendant la partie</span>
          <div className="segmented" role="radiogroup" aria-label="Commentaires en direct">
            {([
              ['off', 'Aucun'],
              ['descriptive', 'Descriptifs'],
              ['full', 'Avec avis'],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={settings.liveComments === k} className={settings.liveComments === k ? 'active' : ''} onClick={() => void update({ liveComments: k })}>
                {label}
              </button>
            ))}
          </div>
        </label>
        <p className="muted small">« Descriptifs » décrit le coup et les pièces en prise (ce que la heatmap montre déjà). « Avec avis » ajoute le jugement du moteur sur tes coups et le coup meilleur, ce qui aide l'apprentissage mais revient à jouer avec une aide.</p>
        <Toggle k="autoReadDebrief" label="Lire automatiquement chaque coup dans le débrief" />
        <div className="btn-row" style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn btn-sm" onClick={() => void speak('Bonjour ! Je suis ton coach. Tu joues Cavalier f3 : bon coup, il développe une pièce et contrôle le centre.', { rate: settings.voiceRate })}>
            Essayer la voix active
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={stopSpeaking}>
            Stop
          </button>
          {speechStatus.state === 'preparing' && <span className="muted small">préparation…</span>}
          {speechStatus.state === 'speaking' && <span className="muted small">🔊 lecture ({speechStatus.engine === 'hd' ? 'voix HD' : 'navigateur'})</span>}
          {speechStatus.state === 'error' && <span className="small" style={{ color: 'var(--red-2)' }}>{speechStatus.message}</span>}
        </div>
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
