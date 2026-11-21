import { CLASSES } from '../data/meta';
import type { DateStr, QuestClaim, SaveData, WeekGoal } from '../data/types';
import { addDays, weekStart } from '../game/dates';
import { questReward, type RewardAmount } from '../game/xp';
import { PLAN_STAT, mainId } from './plan';

/*
 * Planning a whole week: up to three goals that belong to the week rather than to a
 * day, and a small reward for having the week planned before it is under way. A week
 * is named by its Monday.
 */

/** How many goals a week can have. */
export const WEEK_GOALS = 3;
/** For planning a week before its Monday is over. */
export const WEEK_PLAN_REWARD = { xp: 30, gold: 15 };
/** A week counts as planned with at least one goal for the week and a main goal on this many of its days. */
export const WEEK_PLAN_DAYS = 3;

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) => Math.max(now, (prev?.updatedAt ?? 0) + 1);

/** What achieving a goal for the week is worth: the same as a Medium quest, in Focus. */
export const weekGoalReward = (data: SaveData): RewardAmount =>
  questReward('medium', data.hero ? CLASSES[data.hero.heroClass].stat === PLAN_STAT : false);

/** The goals of a week, in the order they were written. */
export function weekGoals(data: SaveData, week: DateStr): WeekGoal[] {
  return Object.values(data.weekGoals)
    .filter((g) => !g.deleted && g.week === week)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

const put = (data: SaveData, goal: WeekGoal): SaveData => ({ ...data, weekGoals: { ...data.weekGoals, [goal.id]: goal } });

/** Adds a goal to a week that isn't over. A week holds three; one that was achieved and then removed still counts. */
export function addWeekGoal(
  data: SaveData,
  anyDay: DateStr,
  title: string,
  today: DateStr,
  now: number,
  id: string = crypto.randomUUID(),
): SaveData {
  const week = weekStart(anyDay);
  const text = title.trim();
  if (text === '' || addDays(week, 6) < today) return data;
  const used = Object.values(data.weekGoals).filter((g) => g.week === week && (!g.deleted || g.done)).length;
  if (used >= WEEK_GOALS) return data;
  return put(data, { id, week, title: text, done: false, doneDate: null, xp: 0, gold: 0, createdAt: now, deleted: false, updatedAt: now });
}

export function renameWeekGoal(data: SaveData, id: string, title: string, now: number): SaveData {
  const prev = data.weekGoals[id];
  const text = title.trim();
  if (!prev || prev.deleted || text === '' || prev.title === text) return data;
  return put(data, { ...prev, title: text, updatedAt: stamp(prev, now) });
}

/** Ticks a goal off, or unticks it. It can't be ticked before its week has begun. */
export function toggleWeekGoal(data: SaveData, id: string, today: DateStr, now: number): SaveData {
  const prev = data.weekGoals[id];
  if (!prev || prev.deleted || prev.week > today) return data;
  if (prev.done) return put(data, { ...prev, done: false, doneDate: null, xp: 0, gold: 0, updatedAt: stamp(prev, now) });
  return put(data, { ...prev, done: true, doneDate: today, ...weekGoalReward(data), updatedAt: stamp(prev, now) });
}

/** Removes a goal. One that was achieved stays: it has earned its XP. */
export function deleteWeekGoal(data: SaveData, id: string, now: number): SaveData {
  const prev = data.weekGoals[id];
  if (!prev || prev.deleted || prev.done) return data;
  return put(data, { ...prev, deleted: true, updatedAt: stamp(prev, now) });
}

export interface WeekPlan {
  week: DateStr;
  goals: WeekGoal[];
  /** How many of the week's days have a main goal. */
  mainDays: number;
  /** Enough is written down for the week to count as planned. */
  ready: boolean;
  /** The reward for planning it has been given. */
  rewarded: boolean;
  /** It can still earn the reward: its Monday isn't over. */
  inTime: boolean;
}

export const weekPlanId = (week: DateStr) => `weekplan|${week}`;

export function weekPlan(data: SaveData, anyDay: DateStr, today: DateStr): WeekPlan {
  const week = weekStart(anyDay);
  const goals = weekGoals(data, week);
  let mainDays = 0;
  for (let i = 0; i < 7; i++) {
    const main = data.plan[mainId(addDays(week, i))];
    if (main && !main.deleted) mainDays++;
  }
  return {
    week,
    goals,
    mainDays,
    ready: goals.length > 0 && mainDays >= WEEK_PLAN_DAYS,
    rewarded: data.claims[weekPlanId(week)]?.claimed ?? false,
    inTime: today <= week,
  };
}

/** Gives the reward for a week that has just become planned, once, if its Monday isn't over. */
export function settleWeekPlan(data: SaveData, anyDay: DateStr, today: DateStr, now: number): SaveData {
  const plan = weekPlan(data, anyDay, today);
  const id = weekPlanId(plan.week);
  if (data.claims[id] || !plan.ready || !plan.inTime) return data;
  const claim: QuestClaim = { id, date: today, slot: -1, stat: PLAN_STAT, claimed: true, ...WEEK_PLAN_REWARD, updatedAt: now };
  return { ...data, claims: { ...data.claims, [id]: claim } };
}
