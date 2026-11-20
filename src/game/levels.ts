export const HERO_XP_BASE = 50;
export const STAT_XP_BASE = 20;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number, base: number): number {
  return Math.round(base * Math.pow(level, 1.5));
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level needs in total. */
  needed: number;
  total: number;
}

export function levelFromXp(xp: number, base: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpToNext(level, base)) {
    rest -= xpToNext(level, base);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level, base), total: xp };
}

export type Rank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

const RANK_FLOORS: [number, Rank][] = [
  [40, 'S'],
  [30, 'A'],
  [20, 'B'],
  [15, 'C'],
  [10, 'D'],
  [5, 'E'],
  [1, 'F'],
];

export function rankForLevel(level: number): Rank {
  for (const [floor, rank] of RANK_FLOORS) if (level >= floor) return rank;
  return 'F';
}

/** The level at which the next rank is reached, or null at S rank. */
export function nextRankLevel(level: number): number | null {
  const higher = RANK_FLOORS.filter(([floor]) => floor > level).map(([floor]) => floor);
  return higher.length ? Math.min(...higher) : null;
}
