import { claimId, dailyQuests } from '../game/dailyQuests';
import { completionId } from '../game/schedule';
import { bonusStreak, walkStreaks } from '../game/streaks';
import { habitReward, questReward } from '../game/xp';
import { CLASSES, SHIELD_COST } from './meta';
import { STARTER_REWARDS, type HabitTemplate } from './templates';
import type {
  Completion,
  DateStr,
  Difficulty,
  Habit,
  HeroClass,
  Purchase,
  Quest,
  QuestClaim,
  Reward,
  SaveData,
  Schedule,
  StatKey,
} from './types';

/*
 * Every change to the save goes through these functions. They never modify their
 * input; they return a new save. `now` is passed in so the rules can be tested.
 */

export const newId = (): string => crypto.randomUUID();

/** A timestamp that is always later than the record's previous one, so the edit wins a merge. */
const stamp = (prev: { updatedAt: number } | undefined | null, now: number) =>
  Math.max(now, (prev?.updatedAt ?? 0) + 1);

const classStat = (data: SaveData): StatKey | null => (data.hero ? CLASSES[data.hero.heroClass].stat : null);

export interface HabitInput {
  name: string;
  category: string;
  stat: StatKey;
  difficulty: Difficulty;
  schedule: Schedule;
  target: number;
}

export function createHero(
  data: SaveData,
  name: string,
  heroClass: HeroClass,
  templates: HabitTemplate[],
  today: DateStr,
  now: number,
): SaveData {
  const habits = { ...data.habits };
  for (const t of templates) {
    const id = newId();
    habits[id] = {
      id,
      name: t.name,
      category: t.category,
      stat: t.stat,
      difficulty: t.difficulty,
      schedule: t.schedule,
      target: t.target,
      startDate: today,
      archivedOn: null,
      deleted: false,
      updatedAt: now,
    };
  }
  const rewards = { ...data.rewards };
  if (Object.keys(rewards).length === 0) {
    for (const r of STARTER_REWARDS) {
      const id = newId();
      rewards[id] = { id, name: r.name, cost: r.cost, deleted: false, updatedAt: now };
    }
  }
  return {
    ...data,
    hero: { name: name.trim(), heroClass, createdAt: now, updatedAt: stamp(data.hero, now) },
    habits,
    rewards,
  };
}

/** Adds habits picked from the library. */
export function addTemplates(data: SaveData, templates: HabitTemplate[], today: DateStr, now: number): SaveData {
  let next = data;
  for (const t of templates) {
    const { name, category, stat, difficulty, schedule, target } = t;
    next = saveHabit(next, { name, category, stat, difficulty, schedule, target }, undefined, today, now);
  }
  return next;
}

export function renameHero(data: SaveData, name: string, now: number): SaveData {
  if (!data.hero || !name.trim()) return data;
  return { ...data, hero: { ...data.hero, name: name.trim(), updatedAt: stamp(data.hero, now) } };
}

function normalise(input: HabitInput): HabitInput {
  const schedule: Schedule =
    input.schedule.kind === 'perWeek'
      ? { kind: 'perWeek', times: Math.min(7, Math.max(1, Math.round(input.schedule.times))) }
      : { kind: 'weekdays', days: [...new Set(input.schedule.days)].sort() };
  return { ...input, name: input.name.trim(), schedule, target: Math.min(99, Math.max(1, Math.round(input.target))) };
}

export function saveHabit(
  data: SaveData,
  input: HabitInput,
  id: string | undefined,
  today: DateStr,
  now: number,
): SaveData {
  const clean = normalise(input);
  const prev = id ? data.habits[id] : undefined;
  const habit: Habit = prev
    ? { ...prev, ...clean, updatedAt: stamp(prev, now) }
    : { id: newId(), ...clean, startDate: today, archivedOn: null, deleted: false, updatedAt: now };
  return { ...data, habits: { ...data.habits, [habit.id]: habit } };
}

export function setArchived(data: SaveData, id: string, archived: boolean, today: DateStr, now: number): SaveData {
  const prev = data.habits[id];
  if (!prev) return data;
  // Restoring starts the habit fresh from today, so the archived gap isn't counted as missed days.
  const habit: Habit = archived
    ? { ...prev, archivedOn: today, updatedAt: stamp(prev, now) }
    : { ...prev, archivedOn: null, startDate: today, updatedAt: stamp(prev, now) };
  return { ...data, habits: { ...data.habits, [id]: habit } };
}

/** Hides the habit for good. Its past completions, and the XP they earned, are kept. */
export function deleteHabit(data: SaveData, id: string, now: number): SaveData {
  const prev = data.habits[id];
  if (!prev) return data;
  return { ...data, habits: { ...data.habits, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

/** Gives or takes back daily-quest rewards so they match what is completed on that date. */
function syncClaims(data: SaveData, date: DateStr, now: number): SaveData {
  let claims = data.claims;
  for (const q of dailyQuests(data, date)) {
    const id = claimId(date, q.slot);
    const prev = claims[id];
    if (q.done === (prev?.claimed ?? false)) continue;
    const claim: QuestClaim = {
      id,
      date,
      slot: q.slot,
      stat: q.done ? q.stat : null,
      claimed: q.done,
      xp: q.done ? q.xp : 0,
      gold: q.done ? q.gold : 0,
      updatedAt: stamp(prev, now),
    };
    claims = { ...claims, [id]: claim };
  }
  return claims === data.claims ? data : { ...data, claims };
}

/**
 * Sets how many times a habit has been ticked on a date. Reaching the target
 * completes it and fixes its XP (base × streak bonus × class bonus) at that moment.
 */
export function setHabitCount(data: SaveData, habitId: string, date: DateStr, count: number, now: number): SaveData {
  const habit = data.habits[habitId];
  if (!habit || habit.deleted) return data;

  const id = completionId(habitId, date);
  const prev = data.completions[id];
  const clamped = Math.min(habit.target, Math.max(0, Math.round(count)));
  const done = clamped >= habit.target;

  let completion: Completion = {
    id,
    habitId,
    date,
    count: clamped,
    done,
    stat: habit.stat,
    xp: 0,
    gold: 0,
    updatedAt: stamp(prev, now),
  };
  let next: SaveData = { ...data, completions: { ...data.completions, [id]: completion } };

  if (done) {
    if (prev?.done) {
      completion = { ...completion, stat: prev.stat, xp: prev.xp, gold: prev.gold };
    } else {
      const streak = walkStreaks(next, date).streaks[habitId];
      const reward = habitReward(habit.difficulty, bonusStreak(habit, streak), classStat(data) === habit.stat);
      completion = { ...completion, ...reward };
    }
    next = { ...next, completions: { ...next.completions, [id]: completion } };
  }

  return syncClaims(next, date, now);
}

export function addQuest(data: SaveData, title: string, stat: StatKey, difficulty: Difficulty, now: number): SaveData {
  if (!title.trim()) return data;
  const quest: Quest = {
    id: newId(),
    title: title.trim(),
    stat,
    difficulty,
    doneDate: null,
    xp: 0,
    gold: 0,
    createdAt: now,
    deleted: false,
    updatedAt: now,
  };
  return { ...data, quests: { ...data.quests, [quest.id]: quest } };
}

export function toggleQuest(data: SaveData, id: string, date: DateStr, now: number): SaveData {
  const prev = data.quests[id];
  if (!prev || prev.deleted) return data;
  const wasDoneOn = prev.doneDate;
  const quest: Quest =
    prev.doneDate === null
      ? { ...prev, doneDate: date, ...questReward(prev.difficulty, classStat(data) === prev.stat), updatedAt: stamp(prev, now) }
      : { ...prev, doneDate: null, xp: 0, gold: 0, updatedAt: stamp(prev, now) };
  const next = { ...data, quests: { ...data.quests, [id]: quest } };
  return syncClaims(next, wasDoneOn ?? date, now);
}

export function deleteQuest(data: SaveData, id: string, now: number): SaveData {
  const prev = data.quests[id];
  if (!prev) return data;
  // A finished quest keeps the XP it earned; an unfinished one simply disappears.
  return { ...data, quests: { ...data.quests, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

export function saveReward(data: SaveData, name: string, cost: number, id: string | undefined, now: number): SaveData {
  if (!name.trim()) return data;
  const prev = id ? data.rewards[id] : undefined;
  const reward: Reward = {
    id: prev?.id ?? newId(),
    name: name.trim(),
    cost: Math.max(1, Math.round(cost)),
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  return { ...data, rewards: { ...data.rewards, [reward.id]: reward } };
}

export function deleteReward(data: SaveData, id: string, now: number): SaveData {
  const prev = data.rewards[id];
  if (!prev) return data;
  return { ...data, rewards: { ...data.rewards, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

function addPurchase(data: SaveData, purchase: Omit<Purchase, 'id'>): SaveData {
  const id = newId();
  return { ...data, purchases: { ...data.purchases, [id]: { id, ...purchase } } };
}

/** Returns null when there isn't enough gold. */
export function buyReward(data: SaveData, id: string, gold: number, date: DateStr, now: number): SaveData | null {
  const reward = data.rewards[id];
  if (!reward || reward.deleted || gold < reward.cost) return null;
  return addPurchase(data, { kind: 'reward', name: reward.name, cost: reward.cost, date, updatedAt: now });
}

/** Returns null when there isn't enough gold. */
export function buyShield(data: SaveData, gold: number, date: DateStr, now: number): SaveData | null {
  if (gold < SHIELD_COST) return null;
  return addPurchase(data, { kind: 'shield', name: 'Streak shield', cost: SHIELD_COST, date, updatedAt: now });
}
