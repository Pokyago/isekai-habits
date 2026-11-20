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
  /** Which part of life it belongs to (see habitCategories.ts). Habits from before categories have none. */
  category?: string;
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

// ---------- health ----------

/** One health check-in. There is at most one per day; its id is its date. Anything not measured is null. */
export interface HealthEntry {
  id: string;
  date: DateStr;
  /** Kilograms. */
  weight: number | null;
  /** Resting heart rate, beats per minute. */
  restingBpm: number | null;
  /** Blood pressure, mmHg. */
  systolic: number | null;
  diastolic: number | null;
  /** Percent. */
  bodyFat: number | null;
  /** Centimetres. */
  waist: number | null;
  /** Average hours of sleep a night since the last check-in. */
  sleepHours: number | null;
  note: string;
  deleted: boolean;
  updatedAt: number;
}

/** How long you slept on one night. The date is the morning you woke up; there is one entry per date. */
export interface SleepLog {
  id: string;
  date: DateStr;
  hours: number;
  deleted: boolean;
  updatedAt: number;
}

export interface HealthProfile {
  heightCm: number | null;
  goalWeight: number | null;
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

/** A subscription: something charged every month or every year (streaming, software, memberships). */
export interface Subscription {
  id: string;
  name: string;
  /** What one charge costs: per month, or per year for a yearly one. */
  amount: number;
  cycle: 'monthly' | 'yearly';
  /** A date it is charged on. Other charges fall a whole number of months or years from it. */
  anchor: DateStr;
  /**
   * 'bank': each charge is added to the entries automatically.
   * 'card': tracked only, since the charge is already inside the credit card bill.
   */
  paidWith: 'bank' | 'card';
  /** False once cancelled or paused: kept in the list but not counted or charged. */
  active: boolean;
  note: string;
  /** The day it was added. Only charges from then on are added to the entries. */
  since: DateStr;
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
  version: 5;
  hero: Hero | null;
  habits: Record<string, Habit>;
  completions: Record<string, Completion>;
  quests: Record<string, Quest>;
  /** Rewards already given: daily quests (`date|slot`), money rewards (`ledger|date`, `budget|month`, `goal|id`, `debt|id`) weekly health check-ins (`health|monday`) and nightly sleep logs (`sleep|date`). */
  claims: Record<string, QuestClaim>;
  rewards: Record<string, Reward>;
  purchases: Record<string, Purchase>;
  money: MoneySettings | null;
  transactions: Record<string, Transaction>;
  recurring: Record<string, Recurring>;
  subscriptions: Record<string, Subscription>;
  goals: Record<string, Goal>;
  debts: Record<string, Debt>;
  health: Record<string, HealthEntry>;
  sleep: Record<string, SleepLog>;
  healthProfile: HealthProfile | null;
}
