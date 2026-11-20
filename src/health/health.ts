import type { DateStr, HealthEntry, QuestClaim, SaveData } from '../data/types';
import { weekStart } from '../game/dates';

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
