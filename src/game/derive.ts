import { STAT_ORDER } from '../data/meta';
import type { DateStr, SaveData, StatKey } from '../data/types';
import { achievements, type Achievement } from './achievements';
import { HERO_XP_BASE, STAT_XP_BASE, levelFromXp, rankForLevel, type LevelInfo, type Rank } from './levels';
import { walkStreaks, type HabitStreak } from './streaks';

export interface Derived {
  heroXp: number;
  level: LevelInfo;
  rank: Rank;
  stats: Record<StatKey, LevelInfo>;
  gold: number;
  goldEarned: number;
  shieldsLeft: number;
  shieldedDays: DateStr[];
  streaks: Record<string, HabitStreak>;
  perfectDays: number;
  completions: number;
  questsDone: number;
  achievements: Achievement[];
}

/** Everything the game shows, calculated from the saved records. */
export function derive(data: SaveData, asOf: DateStr): Derived {
  let heroXp = 0;
  let goldEarned = 0;
  let completions = 0;
  let questsDone = 0;
  const statXp: Record<StatKey, number> = { str: 0, vit: 0, int: 0, spi: 0, foc: 0, for: 0 };

  for (const c of Object.values(data.completions)) {
    if (!c.done) continue;
    completions++;
    heroXp += c.xp;
    statXp[c.stat] += c.xp;
    goldEarned += c.gold;
  }
  for (const q of Object.values(data.quests)) {
    if (q.doneDate === null) continue;
    questsDone++;
    heroXp += q.xp;
    statXp[q.stat] += q.xp;
    goldEarned += q.gold;
  }
  for (const c of Object.values(data.claims)) {
    if (!c.claimed) continue;
    heroXp += c.xp;
    if (c.stat) statXp[c.stat] += c.xp;
    goldEarned += c.gold;
  }

  let spent = 0;
  let rewardsBought = 0;
  for (const p of Object.values(data.purchases)) {
    spent += p.cost;
    if (p.kind === 'reward') rewardsBought++;
  }

  const level = levelFromXp(heroXp, HERO_XP_BASE);
  const stats = Object.fromEntries(STAT_ORDER.map((s) => [s, levelFromXp(statXp[s], STAT_XP_BASE)])) as Record<
    StatKey,
    LevelInfo
  >;
  const walk = walkStreaks(data, asOf);
  const bestDayStreak = Math.max(
    0,
    ...Object.values(walk.streaks)
      .filter((s) => s.unit === 'days')
      .map((s) => s.best),
  );

  return {
    heroXp,
    level,
    rank: rankForLevel(level.level),
    stats,
    gold: goldEarned - spent,
    goldEarned,
    shieldsLeft: walk.shieldsLeft,
    shieldedDays: walk.shieldedDays,
    streaks: walk.streaks,
    perfectDays: walk.perfectDays,
    completions,
    questsDone,
    achievements: achievements({
      completions,
      bestDayStreak,
      heroLevel: level.level,
      topStatLevel: Math.max(...STAT_ORDER.map((s) => stats[s].level)),
      perfectDays: walk.perfectDays,
      goldEarned,
      rewardsBought,
      questsDone,
    }),
  };
}
