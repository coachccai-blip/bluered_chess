export function About() {
  return (
    <div className="stack">
      <h1>À propos</h1>
      <div className="card">
        <p>
          <strong>BlueRed Chess</strong> est une application d'entraînement aux échecs, gratuite et open source, publiée sous licence <strong>GPL v3</strong>. Tout fonctionne dans ton navigateur : aucun serveur, aucun compte, aucune donnée ne quitte l'appareil.
        </p>
        <p className="small muted">Version {__APP_VERSION__}.</p>
      </div>
      <div className="card">
        <h3>Crédits et licences</h3>
        <ul className="small">
          <li>
            <a href="https://stockfishchess.org/" target="_blank" rel="noreferrer">Stockfish</a> (GPL v3), build WebAssembly <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">stockfish.js</a> de Nathan Rugg / Chess.com (GPL v3), version lite mono-thread.
          </li>
          <li>
            <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">chess.js</a> (BSD-2-Clause) pour les règles du jeu.
          </li>
          <li>
            Voix HD hors ligne : <a href="https://github.com/rhasspy/piper" target="_blank" rel="noreferrer">Piper</a> (MIT) via{' '}
            <a href="https://github.com/Mintplex-Labs/piper-tts-web" target="_blank" rel="noreferrer">piper-tts-web</a> (MIT) et{' '}
            <a href="https://onnxruntime.ai/" target="_blank" rel="noreferrer">ONNX Runtime Web</a> (MIT) ; modèles de voix françaises (siwis, tom, upmc) publiés par le projet Piper, téléchargés depuis Hugging Face à la demande.
          </li>
          <li>React, Vite, Zustand, Dexie.js, vite-plugin-pwa (MIT).</li>
          <li>Jeu de pièces SVG monochrome : dessin maison, GPL v3 avec l'application.</li>
        </ul>
        <p className="small muted">
          Le code source complet est publié sur GitHub (dépôt du projet). Conformément à la GPL, toute redistribution doit inclure le code source.
        </p>
      </div>
      <div className="card small muted">
        L'Elo affiché est un « Elo maison » calculé contre des bots artificiels : il n'est pas comparable directement à un classement Lichess ou FIDE.
      </div>
    </div>
  );
}
