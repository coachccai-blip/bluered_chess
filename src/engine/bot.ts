// Bot hybride : Stockfish MultiPV + softmax de température + taux de gaffe (section 6).
import type { BotProfile } from './botProfiles';
import type { EngineClient, EngineLine } from './engineClient';
import { lineScore } from './engineClient';
import { allowsMateInOne, legalMoves, materialCount, sanToLan } from '../chess/game';
import { bookMove } from './openingBook';

export interface Candidate {
  lan: string;
  score: number; // cp du point de vue du bot
  isCapture: boolean;
  isCheck: boolean;
}

/** Softmax : p_i ∝ exp(-(best - score_i) / T). */
export function softmaxProbabilities(scores: number[], temperature: number): number[] {
  if (scores.length === 0) return [];
  const best = Math.max(...scores);
  const t = Math.max(1, temperature);
  const weights = scores.map((s) => Math.exp(-(best - s) / t));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

export function pickIndex(probs: number[], rng: () => number): number {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

/** Bruit gaussien approché (Box-Muller). */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface BotChoice {
  lan: string;
  source: 'book' | 'engine' | 'blunder' | 'native';
  candidates: Candidate[];
}

/**
 * Sélection pure (testable) : à partir des lignes MultiPV, applique personnalité, softmax et gaffes.
 */
export function chooseHybridMove(
  fen: string,
  lines: EngineLine[],
  profile: BotProfile,
  rng: () => number = Math.random,
): BotChoice | null {
  const legal = legalMoves(fen);
  if (legal.length === 0) return null;
  const legalByLan = new Map(legal.map((m) => [`${m.from}${m.to}${m.promotion ?? ''}`, m]));

  const candidates: Candidate[] = [];
  for (const l of lines) {
    const lan = l.pv[0];
    const m = legalByLan.get(lan);
    if (!m) continue;
    let score = lineScore(l);
    const isCapture = Boolean(m.captured);
    const isCheck = m.san.includes('+') || m.san.includes('#');
    if (isCapture || isCheck) score += profile.aggression;
    if (profile.pieceValueNoise > 0) score += gaussian(rng) * profile.pieceValueNoise;
    candidates.push({ lan, score, isCapture, isCheck });
  }
  if (candidates.length === 0) {
    const m = legal[Math.floor(rng() * legal.length)];
    return { lan: `${m.from}${m.to}${m.promotion ?? ''}`, source: 'blunder', candidates: [] };
  }

  // Gaffe : coup légal aléatoire hors MultiPV (sans donner mat en 1 si Elo >= 1200).
  if (profile.blunderRate > 0 && rng() < profile.blunderRate) {
    const inList = new Set(candidates.map((c) => c.lan));
    const others = legal
      .map((m) => `${m.from}${m.to}${m.promotion ?? ''}`)
      .filter((lan) => !inList.has(lan))
      .filter((lan) => profile.elo < 1200 || !allowsMateInOne(fen, lan));
    if (others.length > 0) {
      return { lan: others[Math.floor(rng() * others.length)], source: 'blunder', candidates };
    }
  }

  let temperature = profile.temperature;
  if (profile.endgameWeakness && materialCount(fen).queens === 0) temperature *= 2;
  // Ne jamais rater un mat en 1 quand il est dans la liste, sauf pour les tout petits Elo.
  const mateNow = candidates.find((c) => c.score >= 9990);
  if (mateNow && profile.elo >= 1000) return { lan: mateNow.lan, source: 'engine', candidates };

  const probs = softmaxProbabilities(candidates.map((c) => c.score), temperature);
  const idx = pickIndex(probs, rng);
  return { lan: candidates[idx].lan, source: 'engine', candidates };
}

/** Demande un coup au bot pour la position donnée. `history` = SAN depuis la position initiale standard. */
export async function botMove(
  engine: EngineClient,
  fen: string,
  history: string[] | null,
  profile: BotProfile,
  rng: () => number = Math.random,
): Promise<BotChoice | null> {
  // Livre d'ouverture (seulement depuis la position initiale).
  if (history) {
    const [minPlies, maxPlies] = profile.bookPlies;
    const limit = minPlies + Math.floor(rng() * (maxPlies - minPlies + 1));
    if (history.length < limit) {
      const san = bookMove(history, profile.elo, rng);
      const lan = san ? sanToLan(fen, san) : null;
      if (lan) return { lan, source: 'book', candidates: [] };
    }
  }

  if (profile.mode === 'native') {
    const res = await engine.analyze(fen, {
      depth: profile.depth,
      multiPv: 1,
      uciOptions: { UCI_LimitStrength: true, UCI_Elo: profile.elo },
    });
    if (!res.bestMove) return null;
    return { lan: res.bestMove, source: 'native', candidates: [] };
  }

  const res = await engine.analyze(fen, {
    depth: profile.depth,
    multiPv: profile.multiPv,
    uciOptions: { UCI_LimitStrength: false, UCI_Elo: 3190 },
  });
  const choice = chooseHybridMove(fen, res.lines, profile, rng);
  if (choice) return choice;
  return res.bestMove ? { lan: res.bestMove, source: 'engine', candidates: [] } : null;
}

/** Délai de réflexion simulé (0,5 à 2,5 s), plus court pour les bots faibles. */
export function thinkingDelayMs(profile: BotProfile, rng: () => number = Math.random): number {
  const min = 500;
  const max = profile.elo < 1100 ? 1500 : 2500;
  return min + rng() * (max - min);
}
