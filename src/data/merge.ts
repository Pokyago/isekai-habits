import type { SaveData } from './types';

export function emptySave(): SaveData {
  return {
    version: 9,
    hero: null,
    habits: {},
    completions: {},
    quests: {},
    claims: {},
    rewards: {},
    purchases: {},
    money: null,
    transactions: {},
    recurring: {},
    subscriptions: {},
    goals: {},
    debts: {},
    health: {},
    sleep: {},
    healthProfile: null,
    plan: {},
    days: {},
    habitDays: {},
    meals: {},
    wardrobe: null,
  };
}

/** JSON with object keys sorted, so equal data always gives the same text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function sameSave(a: SaveData, b: SaveData): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Newest wins. On an exact tie the choice is still the same whichever side asks. */
function newer<T extends { updatedAt: number }>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

function mergeMap<T extends { updatedAt: number }>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [id, rec] of Object.entries(b)) out[id] = id in out ? newer(out[id], rec) : rec;
  return out;
}

/**
 * Combines two saves record by record: anything that exists on either side is kept,
 * and where both sides have the same record the most recently changed one wins.
 * Deleted records stay in the save as markers so a deletion isn't undone by a merge.
 */
export function mergeSaves(a: SaveData, b: SaveData): SaveData {
  return {
    version: 9,
    hero: a.hero && b.hero ? newer(a.hero, b.hero) : (a.hero ?? b.hero),
    habits: mergeMap(a.habits, b.habits),
    completions: mergeMap(a.completions, b.completions),
    quests: mergeMap(a.quests, b.quests),
    claims: mergeMap(a.claims, b.claims),
    rewards: mergeMap(a.rewards, b.rewards),
    purchases: mergeMap(a.purchases, b.purchases),
    money: a.money && b.money ? newer(a.money, b.money) : (a.money ?? b.money),
    transactions: mergeMap(a.transactions, b.transactions),
    recurring: mergeMap(a.recurring, b.recurring),
    subscriptions: mergeMap(a.subscriptions, b.subscriptions),
    goals: mergeMap(a.goals, b.goals),
    debts: mergeMap(a.debts, b.debts),
    health: mergeMap(a.health, b.health),
    sleep: mergeMap(a.sleep, b.sleep),
    healthProfile:
      a.healthProfile && b.healthProfile ? newer(a.healthProfile, b.healthProfile) : (a.healthProfile ?? b.healthProfile),
    plan: mergeMap(a.plan, b.plan),
    days: mergeMap(a.days, b.days),
    habitDays: mergeMap(a.habitDays, b.habitDays),
    meals: mergeMap(a.meals, b.meals),
    wardrobe: a.wardrobe && b.wardrobe ? newer(a.wardrobe, b.wardrobe) : (a.wardrobe ?? b.wardrobe),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a save file's text. An empty file is a fresh save; anything unrecognisable throws. */
export function parseSave(text: string): SaveData {
  if (text.trim() === '') return emptySave();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a valid Isekai Habits save (it is not JSON).');
  }
  if (!isRecord(raw) || typeof raw.version !== 'number' || raw.version < 1) {
    throw new Error('This file is not a valid Isekai Habits save.');
  }
  // A newer app may store things this one doesn't know about; writing the file back would lose them.
  if (raw.version > 9) {
    throw new Error('This save was made by a newer version of Isekai Habits. Update the app on this device first.');
  }
  // Older saves simply lack the newer collections: version 1 has no money records, version 2 no subscriptions, version 3 no health check-ins, version 4 no sleep log, version 5 no day plans, version 6 no habit choices, version 7 no meals, version 8 no wardrobe.
  const map = (key: string) => (isRecord(raw[key]) ? raw[key] : {});
  return {
    version: 9,
    hero: isRecord(raw.hero) ? (raw.hero as unknown as SaveData['hero']) : null,
    habits: map('habits') as SaveData['habits'],
    completions: map('completions') as SaveData['completions'],
    quests: map('quests') as SaveData['quests'],
    claims: map('claims') as SaveData['claims'],
    rewards: map('rewards') as SaveData['rewards'],
    purchases: map('purchases') as SaveData['purchases'],
    money: isRecord(raw.money) ? (raw.money as unknown as SaveData['money']) : null,
    transactions: map('transactions') as SaveData['transactions'],
    recurring: map('recurring') as SaveData['recurring'],
    subscriptions: map('subscriptions') as SaveData['subscriptions'],
    goals: map('goals') as SaveData['goals'],
    debts: map('debts') as SaveData['debts'],
    health: map('health') as SaveData['health'],
    sleep: map('sleep') as SaveData['sleep'],
    healthProfile: isRecord(raw.healthProfile) ? (raw.healthProfile as unknown as SaveData['healthProfile']) : null,
    plan: map('plan') as SaveData['plan'],
    days: map('days') as SaveData['days'],
    habitDays: map('habitDays') as SaveData['habitDays'],
    meals: map('meals') as SaveData['meals'],
    wardrobe: isRecord(raw.wardrobe) && isRecord(raw.wardrobe.worn) ? (raw.wardrobe as unknown as SaveData['wardrobe']) : null,
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data, null, 1);
}

/** Short fingerprint of a save, used to tell whether it changed since the last sync. */
export function saveFingerprint(data: SaveData): string {
  const s = stableStringify(data);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(16)}-${s.length}`;
}
