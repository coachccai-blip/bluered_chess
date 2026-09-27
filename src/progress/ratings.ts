// Classement par cadence : un Elo maison, un historique, une série et un bot recommandé pour chaque cadence.
import type { Profile, Rating, TimeControl } from '../data/models';
import { TIME_CONTROL_KEYS } from '../data/models';
import { recommendBot, updateElo, updateStreak } from './elo';

function fresh(elo: number, botElo: number): Rating {
  return { elo, history: [], streak: { wins: 0, losses: 0 }, recommendedBotElo: botElo };
}

/** Complète un profil sans classements par cadence à partir de ses anciens champs (cadence illimitée). */
export function ensureRatings(profile: Profile): Profile {
  if (profile.ratings && TIME_CONTROL_KEYS.every((k) => profile.ratings![k])) return profile;
  const base = profile.ratings ?? ({} as Record<TimeControl, Rating>);
  const ratings = {
    unlimited: base.unlimited ?? { elo: profile.estimatedElo, history: profile.eloHistory, streak: profile.streak, recommendedBotElo: profile.recommendedBotElo },
    rapid: base.rapid ?? fresh(profile.estimatedElo, profile.recommendedBotElo),
    blitz: base.blitz ?? fresh(profile.estimatedElo, profile.recommendedBotElo),
  };
  return { ...profile, ratings };
}

export function ratingFor(profile: Profile, tc: TimeControl): Rating {
  return ensureRatings(profile).ratings![tc];
}

/** Applique un résultat contre un bot dans une cadence ; les champs historiques du profil suivent la cadence illimitée. */
export function applyResult(profile: Profile, tc: TimeControl, botElo: number, score: 0 | 0.5 | 1, date = Date.now()): { profile: Profile; before: number; after: number } {
  const p = ensureRatings(profile);
  const r = p.ratings![tc];
  const after = updateElo(r.elo, botElo, score);
  const streak = updateStreak(r.streak, score);
  const next: Rating = { elo: after, history: [...r.history, { date, elo: after }], streak, recommendedBotElo: recommendBot(botElo, streak, after) };
  const ratings = { ...p.ratings!, [tc]: next };
  const u = ratings.unlimited;
  return {
    profile: { ...p, ratings, estimatedElo: u.elo, eloHistory: u.history, streak: u.streak, recommendedBotElo: u.recommendedBotElo, updatedAt: date },
    before: r.elo,
    after,
  };
}

/** Fixe le niveau de départ (onboarding) pour toutes les cadences. */
export function withStartingLevel(profile: Profile, elo: number): Profile {
  const p = ensureRatings(profile);
  const ratings = { ...p.ratings! };
  for (const k of TIME_CONTROL_KEYS) ratings[k] = { ...ratings[k], elo, recommendedBotElo: elo };
  return { ...p, ratings, estimatedElo: elo, recommendedBotElo: elo };
}
