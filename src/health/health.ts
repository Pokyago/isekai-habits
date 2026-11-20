import type { DateStr, HealthEntry, QuestClaim, SaveData, SleepLog } from '../data/types';
import { addDays, weekStart } from '../game/dates';

/*
 * Health check-ins: a few body measurements, meant to be taken about once a week.
 * The app only records and charts them; it does not judge the numbers.
 */

export type MetricKey = 'weight' | 'restingBpm' | 'systolic' | 'diastolic' | 'bodyFat' | 'waist' | 'sleepHours';

export interface Metric {
  key: MetricKey;
  name: string;
  unit: string;
  decimals: number;
  /** Values outside this range are treated as typing mistakes. */
  min: number;
  max: number;
}

export const METRICS: Record<MetricKey, Metric> = {
  weight: { key: 'weight', name: 'Weight', unit: 'kg', decimals: 1, min: 20, max: 400 },
  restingBpm: { key: 'restingBpm', name: 'Resting heart rate', unit: 'bpm', decimals: 0, min: 25, max: 220 },
  systolic: { key: 'systolic', name: 'Systolic', unit: 'mmHg', decimals: 0, min: 50, max: 280 },
  diastolic: { key: 'diastolic', name: 'Diastolic', unit: 'mmHg', decimals: 0, min: 30, max: 200 },
  bodyFat: { key: 'bodyFat', name: 'Body fat', unit: '%', decimals: 1, min: 2, max: 70 },
  waist: { key: 'waist', name: 'Waist', unit: 'cm', decimals: 1, min: 30, max: 250 },
  sleepHours: { key: 'sleepHours', name: 'Sleep a night', unit: 'h', decimals: 1, min: 0, max: 24 },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** One Vitality reward per calendar week (Monday to Sunday) for checking in. */
export const HEALTH_REWARD = { xp: 20, gold: 10 };

export type Measurements = Record<MetricKey, number | null>;

export interface CheckInInput extends Measurements {
  date: DateStr;
  note: string;
}

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) =>
  Math.max(now, (prev?.updatedAt ?? 0) + 1);

/** Reads a typed number, accepting a comma or a dot. Empty text is "not measured" (null). */
export function parseMeasurement(text: string, metric: Metric): number | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return 'invalid';
  const value = Number(t.replace(',', '.'));
  if (!Number.isFinite(value) || value < metric.min || value > metric.max) return 'invalid';
  const factor = 10 ** metric.decimals;
  return Math.round(value * factor) / factor;
}

export function checkIns(data: SaveData): HealthEntry[] {
  return Object.values(data.health)
    .filter((e) => !e.deleted)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const hasAnyValue = (m: Measurements) => METRIC_KEYS.some((k) => m[k] !== null);

/**
 * Saves the check-in for a date (there is one per date, so saving again replaces it).
 * The first check-in recorded in the current week earns the weekly reward; filling
 * in older weeks afterwards does not.
 */
export function saveCheckIn(data: SaveData, input: CheckInInput, today: DateStr, now: number): SaveData {
  if (!hasAnyValue(input) || input.date > today) return data;
  const prev = data.health[input.date];
  const entry: HealthEntry = {
    ...input,
    id: input.date,
    note: input.note.trim(),
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  let next: SaveData = { ...data, health: { ...data.health, [entry.id]: entry } };

  const week = weekStart(input.date);
  const claimId = `health|${week}`;
  if (week === weekStart(today) && !next.claims[claimId]) {
    const claim: QuestClaim = {
      id: claimId,
      date: today,
      slot: -1,
      stat: 'vit',
      claimed: true,
      xp: HEALTH_REWARD.xp,
      gold: HEALTH_REWARD.gold,
      updatedAt: now,
    };
    next = { ...next, claims: { ...next.claims, [claimId]: claim } };
  }
  return next;
}

export function deleteCheckIn(data: SaveData, id: string, now: number): SaveData {
  const prev = data.health[id];
  if (!prev) return data;
  return { ...data, health: { ...data.health, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

export function saveHealthProfile(
  data: SaveData,
  profile: { heightCm: number | null; goalWeight: number | null },
  now: number,
): SaveData {
  return { ...data, healthProfile: { ...profile, updatedAt: stamp(data.healthProfile, now) } };
}

export interface Reading {
  date: DateStr;
  value: number;
}

/** Every recorded value of one measurement, oldest first. */
export function readings(entries: HealthEntry[], key: MetricKey): Reading[] {
  const out: Reading[] = [];
  for (const e of entries) {
    const value = e[key];
    if (value !== null && value !== undefined) out.push({ date: e.date, value });
  }
  return out;
}

/** The most recent value of a measurement and the one before it. */
export function latest(entries: HealthEntry[], key: MetricKey): { last: Reading | null; previous: Reading | null } {
  const all = readings(entries, key);
  return { last: all[all.length - 1] ?? null, previous: all[all.length - 2] ?? null };
}

/** Body-mass index: kilograms over metres squared. */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function checkedInThisWeek(data: SaveData, today: DateStr): boolean {
  const week = weekStart(today);
  return checkIns(data).some((e) => weekStart(e.date) === week);
}

// ---------- nightly sleep ----------

/** A small Vitality reward for logging last night's sleep, once a day. */
export const SLEEP_REWARD = { xp: 3, gold: 2 };

/**
 * Reads typed sleep: "7,5", "7.5", "7:30" or "7h30". Returns hours, or null if it
 * isn't a sensible amount.
 */
export function parseSleep(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (t === '') return null;
  let hours: number;
  const clock = /^(\d{1,2})(?::|h)(\d{1,2})?(?:m|min)?$/.exec(t);
  if (clock) {
    const minutes = Number(clock[2] ?? 0);
    if (minutes >= 60) return null;
    hours = Number(clock[1]) + minutes / 60;
  } else if (/^\d{1,2}([.,]\d+)?$/.test(t)) {
    hours = Number(t.replace(',', '.'));
  } else {
    return null;
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
  return Math.round(hours * 100) / 100;
}

/** 7.5 → "7 h 30 min". */
export function formatSleep(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** 7.5 → "7:30", the way it can be typed back in. */
export function sleepInputText(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function sleepLogs(data: SaveData): SleepLog[] {
  return Object.values(data.sleep)
    .filter((s) => !s.deleted)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Records how long you slept. The date is the morning you woke up. Logging last
 * night (today's date) earns the small daily reward; filling in older nights doesn't.
 */
export function saveSleep(data: SaveData, date: DateStr, hours: number, today: DateStr, now: number): SaveData {
  if (date > today || !(hours > 0) || hours > 24) return data;
  const prev = data.sleep[date];
  const log: SleepLog = { id: date, date, hours, deleted: false, updatedAt: stamp(prev, now) };
  let next: SaveData = { ...data, sleep: { ...data.sleep, [date]: log } };

  const claimId = `sleep|${date}`;
  if (date === today && !next.claims[claimId]) {
    const claim: QuestClaim = {
      id: claimId,
      date: today,
      slot: -1,
      stat: 'vit',
      claimed: true,
      xp: SLEEP_REWARD.xp,
      gold: SLEEP_REWARD.gold,
      updatedAt: now,
    };
    next = { ...next, claims: { ...next.claims, [claimId]: claim } };
  }
  return next;
}

export function deleteSleep(data: SaveData, date: DateStr, now: number): SaveData {
  const prev = data.sleep[date];
  if (!prev) return data;
  return { ...data, sleep: { ...data.sleep, [date]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

/** Average of the nights logged in the `nights` days ending on `until`, or null if none were. */
export function averageSleep(logs: SleepLog[], until: DateStr, nights = 7): number | null {
  const from = addDays(until, -(nights - 1));
  const inside = logs.filter((l) => l.date >= from && l.date <= until);
  if (inside.length === 0) return null;
  return Math.round((inside.reduce((n, l) => n + l.hours, 0) / inside.length) * 100) / 100;
}

/** For each logged night, the average of the week ending that night: a smoother line than the nights themselves. */
export function rollingSleep(logs: SleepLog[], nights = 7): Reading[] {
  return logs.map((l) => ({ date: l.date, value: averageSleep(logs, l.date, nights)! }));
}
