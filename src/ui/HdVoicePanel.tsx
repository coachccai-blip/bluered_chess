// Panneau « Voix HD hors ligne » : catalogue, téléchargement avec progression, sélection, essai, suppression.
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settingsStore';
import { HD_RUNTIME_MB, HD_VOICES, formatProgress } from './hdVoiceCatalog';
import { hdVoice, hdVoiceSupported, type Progress } from './hdVoice';
import { speak, stopSpeaking } from './speech';

export function HdVoicePanel() {
  const { settings, update } = useSettings();
  const [stored, setStored] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = hdVoiceSupported();

  const refresh = async () => {
    try {
      setStored(await hdVoice.stored());
    } catch {
      setStored([]);
    }
  };
  useEffect(() => {
    if (supported) void refresh();
  }, [supported]);

  const download = async (id: string) => {
    setBusy(id);
    setError(null);
    setProgress(null);
    try {
      await hdVoice.download(id, setProgress);
      // Prépare le moteur (télécharge et met en cache les fichiers WASM) pour que le premier « parler » soit rapide.
      await hdVoice.warmup(id, setProgress);
      await refresh();
      await update({ hdVoiceId: id });
    } catch (e) {
      setError(`Téléchargement impossible : ${(e as Error).message}. Vérifie la connexion (les voix viennent de huggingface.co).`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const remove = async (id: string) => {
    stopSpeaking();
    await hdVoice.remove(id);
    if (settings.hdVoiceId === id) await update({ hdVoiceId: undefined });
    await refresh();
  };

  const test = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await speak('Bonjour ! Je suis ta voix HD. Tu joues Cavalier f3 : bon coup, il développe une pièce et contrôle le centre.', { hdVoiceId: id, rate: settings.voiceRate });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!supported) {
    return <p className="small muted">Les voix HD hors ligne ne sont pas disponibles sur ce navigateur (stockage privé ou WebAssembly manquant). La voix du navigateur reste utilisable.</p>;
  }

  return (
    <div style={{ margin: '.5rem 0 .75rem' }} data-testid="hd-voices">
      <div className="row spread" style={{ marginBottom: '.4rem' }}>
        <strong>Voix HD hors ligne</strong>
        {settings.hdVoiceId ? <span className="tag tag-ok">active : {HD_VOICES.find((v) => v.id === settings.hdVoiceId)?.label ?? settings.hdVoiceId}</span> : <span className="tag">voix du navigateur</span>}
      </div>
      <p className="muted small">
        Télécharge une voix neuronale française (moteur Piper, open source) : elle est stockée dans le navigateur et parle sans connexion. Un téléchargement unique par voix, plus environ {HD_RUNTIME_MB} Mo de fichiers moteur mis en cache au premier usage. La première phrase peut prendre 2 à 4 secondes le temps de charger le moteur.
      </p>
      <div className="stack" style={{ gap: '.4rem' }}>
        {HD_VOICES.map((v) => {
          const isStored = stored.includes(v.id);
          const active = settings.hdVoiceId === v.id;
          const isBusy = busy === v.id;
          return (
            <div key={v.id} className="indicator" style={{ flexWrap: 'wrap' }} data-testid={`hd-voice-${v.id}`}>
              <span>
                <strong>{v.label}</strong> <span className="tag">{v.quality}</span> <span className="muted small">{v.description} · {v.sizeMb} Mo</span>
              </span>
              <span className="btn-row">
                {!isStored ? (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void download(v.id)}>
                    {isBusy ? 'Téléchargement…' : 'Télécharger'}
                  </button>
                ) : (
                  <>
                    <button type="button" className={`btn btn-sm ${active ? '' : 'btn-primary'}`} disabled={active || busy !== null} onClick={() => void update({ hdVoiceId: v.id })}>
                      {active ? 'Utilisée' : 'Utiliser'}
                    </button>
                    <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void test(v.id)}>
                      {isBusy ? '…' : 'Essayer'}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void remove(v.id)}>
                      Supprimer
                    </button>
                  </>
                )}
              </span>
              {isBusy && progress && (
                <div style={{ width: '100%' }}>
                  <div className="progress">
                    <div style={{ width: `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%` }} />
                  </div>
                  <div className="muted small">{formatProgress(progress.loaded, progress.total)}</div>
                </div>
              )}
            </div>
          );
        })}
        {settings.hdVoiceId && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void update({ hdVoiceId: undefined })}>
            Revenir à la voix du navigateur
          </button>
        )}
      </div>
      {error && <p className="small" style={{ color: 'var(--red-2)' }}>{error}</p>}
    </div>
  );
}
