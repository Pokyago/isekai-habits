/** Local calendar date as YYYY-MM-DD. Compares correctly as a string. */
export type DateStr = string;

export type StatKey = 'str' | 'vit' | 'int' | 'spi' | 'foc' | 'for';
export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard';
export type HeroClass = 'warrior' | 'paladin' | 'mage' | 'monk' | 'ranger' | 'merchant';

export type Schedule =
  /** Due on specific weekdays. 0 = Sunday … 6 = Saturday. */
  | { kind: 'weekdays'; days: number[] }
  /** Due a number of times per week, on any days. Weeks run Monday–Sunday. */
  | { kind: 'perWeek'; times: number };

export interface Hero {
  name: string;
  heroClass: HeroClass;
  createdAt: number;
  updatedAt: number;
}

export interface Habit {
  id: string;
  name: string;
  stat: StatKey;
  difficulty: Difficulty;
  schedule: Schedule;
  /** How many times it must be ticked in a day to count as done (1 for a simple check). */
  target: number;
  startDate: DateStr;
  archivedOn: DateStr | null;
  deleted: boolean;
  updatedAt: number;
}

/** One habit on one day. XP and gold are fixed at the moment it is completed. */
export interface Completion {
  id: string; // `${habitId}|${date}`
  habitId: string;
  date: DateStr;
  count: number;
  done: boolean;
  stat: StatKey;
  xp: number;
  gold: number;
  updatedAt: number;
}

/** A one-off to-do. */
export interface Quest {
  id: string;
  title: string;
  stat: StatKey;
  difficulty: Difficulty;
  doneDate: DateStr | null;
  xp: number;
  gold: number;
  createdAt: number;
  deleted: boolean;
  updatedAt: number;
}

/** Reward for a completed daily quest. One per day and slot, so two devices can't double-claim. */
export interface QuestClaim {
  id: string; // `${date}|${slot}`
  date: DateStr;
  slot: number;
  stat: StatKey | null;
  claimed: boolean;
  xp: number;
  gold: number;
  updatedAt: number;
}

export interface Reward {
  id: string;
  name: string;
  cost: number;
  deleted: boolean;
  updatedAt: number;
}

export interface Purchase {
  id: string;
  kind: 'reward' | 'shield';
  name: string;
  cost: number;
  date: DateStr;
  updatedAt: number;
}

/**
 * Everything that is saved and synced. It holds only records — XP totals, levels,
 * gold and streaks are always calculated from them, so merging two copies is safe.
 */
export interface SaveData {
  version: 1;
  hero: Hero | null;
  habits: Record<string, Habit>;
  completions: Record<string, Completion>;
  quests: Record<string, Quest>;
  claims: Record<string, QuestClaim>;
  rewards: Record<string, Reward>;
  purchases: Record<string, Purchase>;
}
