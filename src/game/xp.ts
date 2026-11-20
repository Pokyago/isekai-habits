import { CLASS_BONUS } from '../data/meta';
import type { Difficulty } from '../data/types';

export const BASE_XP: Record<Difficulty, number> = { trivial: 5, easy: 10, medium: 20, hard: 40 };

export const MAX_STREAK_BONUS = 0.5;
export const STREAK_BONUS_CAP = 30;

/** 1.0 with no streak, rising evenly to 1.5 at a 30-day streak. */
export function streakMultiplier(streak: number): number {
  const capped = Math.min(Math.max(streak, 0), STREAK_BONUS_CAP);
  return 1 + (capped / STREAK_BONUS_CAP) * MAX_STREAK_BONUS;
}

export interface RewardAmount {
  xp: number;
  gold: number;
}

export function habitReward(difficulty: Difficulty, bonusStreak: number, classBonus: boolean): RewardAmount {
  const xp = Math.round(BASE_XP[difficulty] * streakMultiplier(bonusStreak) * (classBonus ? 1 + CLASS_BONUS : 1));
  return { xp, gold: Math.ceil(xp / 2) };
}

export function questReward(difficulty: Difficulty, classBonus: boolean): RewardAmount {
  return habitReward(difficulty, 0, classBonus);
}
