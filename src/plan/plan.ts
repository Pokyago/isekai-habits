import { CLASSES } from '../data/meta';
import type { DateStr, DayPlan, HabitDay, PlanItem, Quest, QuestClaim, SaveData, StatKey } from '../data/types';
import { addDays } from '../game/dates';
import { completionId, type DayChoice } from '../game/schedule';
import { questReward, type RewardAmount } from '../game/xp';
import { dayInMonth, monthOf } from '../money/format';
import { billsToPay } from '../money/cards';
import { activeSubscriptions, isFloating, nextCharge } from '../money/subscriptions';
import { mealsFor } from './meals';

/*
 * Planning a day: one main goal, other goals and appointments, a wake-up time and
 * bedtime, and a note. A plan can be written for any day from today on; things are
 * ticked off once their day has come.
 */

/** Following through on a plan trains Focus. */
export const PLAN_STAT: StatKey = 'foc';
/** Other goals earn XP for the first few finished in a day, so a long list can't be farmed. */
export const REWARDED_GOALS = 3;
/** For setting tomorrow's main goal the day before. */
export const PLAN_AHEAD_REWARD = { xp: 5, gold: 2 };

const classBonus = (data: SaveData) => (data.hero ? CLASSES[data.hero.heroClass].stat === PLAN_STAT : false);

/** What achieving the main goal is worth (the same as a Medium quest). */
export const mainReward = (data: SaveData): RewardAmount => questReward('medium', classBonus(data));
/** What each of the first few other goals is worth (the same as an Easy quest). */
export const goalReward = (data: SaveData): RewardAmount => questReward('easy', classBonus(data));

export const mainId = (date: DateStr): string => `main|${date}`;

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) =>
  Math.max(now, (prev?.updatedAt ?? 0) + 1);

export interface PlanInput {
  title: string;
  /** HH:MM, or null for no set time. */
  time: string | null;
}

/** A 24-hour clock time written as HH:MM. */
export function isTime(text: string | null | undefined): text is string {
  return typeof text === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** A clock time moved by some hours, wrapping past midnight: 06:30 less 8 hours is 22:30. */
export const shiftTime = (time: string, hours: number): string => clock(minutesOf(time) + Math.round(hours * 60));

/** Hours from going to bed to waking up the next morning: 23:00 to 06:30 is 7.5. */
export function hoursAsleep(bed: string, wake: string): number {
  const minutes = (((minutesOf(wake) - minutesOf(bed)) % 1440) + 1440) % 1440;
  return (minutes === 0 ? 1440 : minutes) / 60;
}

// ---------- reading ----------

export interface Plan {
  main: PlanItem | null;
  /** Everything else: timed ones first in time order, then the rest in the order they were added. */
  items: PlanItem[];
  /** One-off tasks from the quest log that were put on this day. */
  quests: Quest[];
  day: DayPlan | null;
}

export function planFor(data: SaveData, date: DateStr): Plan {
  let main: PlanItem | null = null;
  const items: PlanItem[] = [];
  for (const p of Object.values(data.plan)) {
    if (p.deleted || p.date !== date) continue;
    if (p.main) main = p;
    else items.push(p);
  }
  items.sort(
    (a, b) =>
      Number(a.time === null) - Number(b.time === null) ||
      (a.time ?? '').localeCompare(b.time ?? '') ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id),
  );
  // A quest finished on another day has left this day's plan.
  const quests = Object.values(data.quests)
    .filter((q) => !q.deleted && q.plannedFor === date && (q.doneDate === null || q.doneDate === date))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { main, items, quests, day: data.days[date] ?? null };
}

/** The one-day choices made about habits on a date, by habit id. */
export function habitChoices(data: SaveData, date: DateStr): Map<string, DayChoice> {
  const out = new Map<string, DayChoice>();
  for (const c of Object.values(data.habitDays)) {
    if (c.date === date && c.state !== 'none' && data.habits[c.habitId] && !data.habits[c.habitId].deleted) {
      out.set(c.habitId, c.state);
    }
  }
  return out;
}

/** How many things are planned for a day, and how many are ticked off. */
export function planProgress(data: SaveData, date: DateStr): { total: number; done: number } {
  const { main, items, quests } = planFor(data, date);
  const all = main ? [main, ...items] : items;
  return {
    total: all.length + quests.length,
    done: all.filter((p) => p.done).length + quests.filter((q) => q.doneDate !== null).length,
  };
}

/** Whether anything at all has been written down for a day. */
export function hasPlan(data: SaveData, date: DateStr): boolean {
  const { main, items, quests, day } = planFor(data, date);
  return (
    main !== null ||
    items.length > 0 ||
    quests.length > 0 ||
    habitChoices(data, date).size > 0 ||
    mealsFor(data, date).length > 0 ||
    (day !== null && (day.wake !== null || day.bed !== null || day.note !== ''))
  );
}

/** Planned things that were never ticked off, from the `days` days before `before`. Oldest first. */
export function unfinishedBefore(data: SaveData, before: DateStr, days = 7): PlanItem[] {
  const since = addDays(before, -days);
  return Object.values(data.plan)
    .filter((p) => !p.deleted && !p.done && p.date < before && p.date >= since)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.main) - Number(a.main) || a.createdAt - b.createdAt);
}

/** What the next other goal ticked off on a date would earn: the reward, or nothing once the day's few are used. */
export function nextGoalReward(data: SaveData, date: DateStr): RewardAmount {
  // Removed ones still count, so deleting and re-adding doesn't earn again.
  const rewarded = Object.values(data.plan).filter((p) => p.date === date && !p.main && p.done && p.xp > 0).length;
  return rewarded < REWARDED_GOALS ? goalReward(data) : { xp: 0, gold: 0 };
}

export interface MoneyDue {
  id: string;
  name: string;
  amount: number;
  kind: 'expense' | 'income';
  /** A subscription charged to the credit card doesn't leave the bank account that day. */
  onCard: boolean;
}

/** Monthly items, subscription charges and credit card bills that fall on a date, biggest first. */
export function moneyDue(data: SaveData, date: DateStr): MoneyDue[] {
  if (!data.money) return [];
  const month = monthOf(date);
  const due: MoneyDue[] = [];
  for (const r of Object.values(data.recurring)) {
    if (r.deleted || r.startMonth > month || (r.endMonth !== null && month > r.endMonth)) continue;
    if (dayInMonth(month, r.day) === date) {
      due.push({ id: r.id, name: r.name, amount: r.amount, kind: r.kind, onCard: false });
    }
  }
  for (const s of activeSubscriptions(data)) {
    if (!isFloating(s) && nextCharge(s, date) === date) {
      due.push({ id: s.id, name: s.name, amount: s.amount, kind: 'expense', onCard: s.paidWith === 'card' });
    }
  }
  // A card bill that has closed and is due that day, with what is still to pay on it.
  for (const bill of billsToPay(data, date)) {
    if (bill.due === date) {
      due.push({ id: `bill|${bill.card.id}|${bill.month}`, name: `${bill.card.name} bill`, amount: bill.left, kind: 'expense', onCard: false });
    }
  }
  return due.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

// ---------- changing ----------

const put = (data: SaveData, item: PlanItem): SaveData => ({ ...data, plan: { ...data.plan, [item.id]: item } });

const fresh = (id: string, date: DateStr, title: string, main: boolean, time: string | null, now: number): PlanItem => ({
  id,
  date,
  title,
  main,
  time,
  done: false,
  xp: 0,
  gold: 0,
  createdAt: now,
  deleted: false,
  updatedAt: now,
});

/**
 * Sets, rewords or (with empty text) clears a day's main goal. Setting tomorrow's
 * the day before earns a small reward, once per day planned.
 */
export function setMainGoal(data: SaveData, date: DateStr, title: string, today: DateStr, now: number): SaveData {
  if (date < today) return data;
  const id = mainId(date);
  const prev = data.plan[id];
  const text = title.trim();

  if (text === '') {
    // An achieved goal stays: it has already earned its XP.
    if (!prev || prev.deleted || prev.done) return data;
    return put(data, { ...prev, deleted: true, updatedAt: stamp(prev, now) });
  }
  if (prev && !prev.deleted && prev.title === text) return data;

  let next = put(
    data,
    prev ? { ...prev, title: text, deleted: false, updatedAt: stamp(prev, now) } : fresh(id, date, text, true, null, now),
  );

  const claimId = `plan|${date}`;
  if (date === addDays(today, 1) && !next.claims[claimId]) {
    const claim: QuestClaim = {
      id: claimId,
      date: today,
      slot: -1,
      stat: PLAN_STAT,
      claimed: true,
      xp: PLAN_AHEAD_REWARD.xp,
      gold: PLAN_AHEAD_REWARD.gold,
      updatedAt: now,
    };
    next = { ...next, claims: { ...next.claims, [claimId]: claim } };
  }
  return next;
}

export function addPlanItem(data: SaveData, date: DateStr, input: PlanInput, now: number, id: string = crypto.randomUUID()): SaveData {
  const title = input.title.trim();
  if (title === '') return data;
  return put(data, fresh(id, date, title, false, isTime(input.time) ? input.time : null, now));
}

export function updatePlanItem(data: SaveData, id: string, input: PlanInput, now: number): SaveData {
  const prev = data.plan[id];
  const title = input.title.trim();
  if (!prev || prev.deleted || title === '') return data;
  const time = prev.main ? null : isTime(input.time) ? input.time : null;
  if (prev.title === title && prev.time === time) return data;
  return put(data, { ...prev, title, time, updatedAt: stamp(prev, now) });
}

/** Ticks something off, or unticks it. Nothing can be ticked before its day has come. */
export function togglePlanItem(data: SaveData, id: string, today: DateStr, now: number): SaveData {
  const prev = data.plan[id];
  if (!prev || prev.deleted || prev.date > today) return data;
  if (prev.done) return put(data, { ...prev, done: false, xp: 0, gold: 0, updatedAt: stamp(prev, now) });
  const reward = prev.main ? mainReward(data) : nextGoalReward(data, prev.date);
  return put(data, { ...prev, done: true, ...reward, updatedAt: stamp(prev, now) });
}

/** Removes something from the plan. One that was ticked keeps the XP it earned. */
export function deletePlanItem(data: SaveData, id: string, now: number): SaveData {
  const prev = data.plan[id];
  if (!prev || prev.deleted) return data;
  // An achieved main goal can't be removed: its place would be free to earn again.
  if (prev.main && prev.done) return data;
  return put(data, { ...prev, deleted: true, updatedAt: stamp(prev, now) });
}

/**
 * Moves something unfinished to another day. A main goal becomes the main goal of
 * the new day if that day has none, and one of its other goals if it does.
 */
export function movePlanItem(data: SaveData, id: string, toDate: DateStr, now: number, newId: string = crypto.randomUUID()): SaveData {
  const prev = data.plan[id];
  if (!prev || prev.deleted || prev.done || prev.date === toDate) return data;
  if (!prev.main) return put(data, { ...prev, date: toDate, updatedAt: stamp(prev, now) });

  const removed = put(data, { ...prev, deleted: true, updatedAt: stamp(prev, now) });
  const target = data.plan[mainId(toDate)];
  if (!target) return put(removed, fresh(mainId(toDate), toDate, prev.title, true, null, now));
  if (target.deleted && !target.done) {
    return put(removed, { ...target, title: prev.title, deleted: false, updatedAt: stamp(target, now) });
  }
  return put(removed, fresh(newId, toDate, prev.title, false, null, now));
}

/**
 * Records a one-day choice about a habit, or undoes it with null: a priority for
 * the day, skipped, or added for just that day. Days that have passed can't be changed.
 */
export function setHabitChoice(
  data: SaveData,
  habitId: string,
  date: DateStr,
  choice: DayChoice | null,
  today: DateStr,
  now: number,
): SaveData {
  const habit = data.habits[habitId];
  if (!habit || habit.deleted || date < today) return data;
  const id = completionId(habitId, date);
  const prev = data.habitDays[id];
  const state: HabitDay['state'] = choice ?? 'none';
  if (prev ? prev.state === state : state === 'none') return data;
  const record: HabitDay = { id, habitId, date, state, updatedAt: stamp(prev, now) };
  return { ...data, habitDays: { ...data.habitDays, [id]: record } };
}

/** Puts a one-off task from the quest log on a day's plan, or takes it off again with null. */
export function planQuest(data: SaveData, questId: string, date: DateStr | null, now: number): SaveData {
  const prev = data.quests[questId];
  if (!prev || prev.deleted || prev.doneDate !== null || (prev.plannedFor ?? null) === date) return data;
  return { ...data, quests: { ...data.quests, [questId]: { ...prev, plannedFor: date, updatedAt: stamp(prev, now) } } };
}

/** Saves the wake-up time, bedtime or note for a day. Only what is passed changes. */
export function saveDay(
  data: SaveData,
  date: DateStr,
  patch: { wake?: string | null; bed?: string | null; note?: string },
  now: number,
): SaveData {
  const prev = data.days[date];
  const time = (value: string | null | undefined, old: string | null) =>
    value === undefined ? old : isTime(value) ? value : null;
  const day: DayPlan = {
    id: date,
    date,
    wake: time(patch.wake, prev?.wake ?? null),
    bed: time(patch.bed, prev?.bed ?? null),
    note: patch.note === undefined ? (prev?.note ?? '') : patch.note.trim(),
    updatedAt: stamp(prev, now),
  };
  if (prev ? prev.wake === day.wake && prev.bed === day.bed && prev.note === day.note : !day.wake && !day.bed && !day.note) {
    return data;
  }
  return { ...data, days: { ...data.days, [date]: day } };
}
