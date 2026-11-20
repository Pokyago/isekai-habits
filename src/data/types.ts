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

/**
 * A reward that has been given (or judged and not given). The id says what for, so two
 * devices can't both claim it: a daily quest is `${date}|${slot}`; money rewards use slot -1.
 */
export interface QuestClaim {
  id: string;
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

// ---------- money ----------
// All amounts are whole cents (centavos), always positive; `kind` says which way the money went.

/** A calendar month as YYYY-MM. */
export type MonthStr = string;

export interface MoneySettings {
  /** ISO currency code, e.g. BRL. */
  currency: string;
  /** What was in the bank account on `openingDate`. Only transactions from that date on change the balance. */
  openingBalance: number;
  openingDate: DateStr;
  /** Monthly spending limit, or null for none. */
  budget: number | null;
  updatedAt: number;
}

export type TxKind = 'expense' | 'income';

export interface Transaction {
  id: string;
  date: DateStr;
  kind: TxKind;
  amount: number;
  category: string;
  note: string;
  /** A savings goal this money was put towards, if any. */
  goalId: string | null;
  /** A debt this payment went to, if any. */
  debtId: string | null;
  source: 'manual' | 'recurring' | 'import';
  deleted: boolean;
  updatedAt: number;
}

/** Something that happens every month (rent, salary, an instalment) and is added automatically. */
export interface Recurring {
  id: string;
  name: string;
  kind: TxKind;
  amount: number;
  category: string;
  /** Day of the month, 1–31. Shorter months use their last day. */
  day: number;
  startMonth: MonthStr;
  /** Last month it applies to, or null to go on indefinitely. */
  endMonth: MonthStr | null;
  goalId: string | null;
  debtId: string | null;
  deleted: boolean;
  updatedAt: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** Already put aside outside the transactions tracked here. */
  saved: number;
  targetDate: DateStr | null;
  createdAt: number;
  deleted: boolean;
  updatedAt: number;
}

export interface Debt {
  id: string;
  name: string;
  /** Total owed when the debt was added (edit it if interest is charged). Payments are linked transactions. */
  owed: number;
  targetDate: DateStr | null;
  createdAt: number;
  deleted: boolean;
  updatedAt: number;
}

/**
 * Everything that is saved and synced. It holds only records — XP totals, levels,
 * gold, streaks and the bank balance are always calculated from them, so merging
 * two copies is safe.
 */
export interface SaveData {
  version: 2;
  hero: Hero | null;
  habits: Record<string, Habit>;
  completions: Record<string, Completion>;
  quests: Record<string, Quest>;
  /** Rewards already given: daily quests (`date|slot`) and money rewards (`ledger|date`, `budget|month`, `goal|id`, `debt|id`). */
  claims: Record<string, QuestClaim>;
  rewards: Record<string, Reward>;
  purchases: Record<string, Purchase>;
  money: MoneySettings | null;
  transactions: Record<string, Transaction>;
  recurring: Record<string, Recurring>;
  goals: Record<string, Goal>;
  debts: Record<string, Debt>;
}
