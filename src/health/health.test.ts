import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { HABIT_CATEGORIES } from '../data/habitCategories';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import { ALL_TEMPLATES, SUGGESTED_TEMPLATES, TEMPLATE_GROUPS, categoryOf } from '../data/templates';
import type { SaveData } from '../data/types';
import { derive } from '../game/derive';
import {
  METRICS,
  bmi,
  checkIns,
  checkedInThisWeek,
  deleteCheckIn,
  latest,
  parseMeasurement,
  readings,
  averageSleep,
  deleteSleep,
  formatSleep,
  parseSleep,
  rollingSleep,
  saveCheckIn,
  saveHealthProfile,
  saveSleep,
  sleepInputText,
  sleepLogs,
  type CheckInInput,
} from './health';

const FRI = '2026-11-20'; // a Friday; its week starts Monday 2026-11-16

const check = (over: Partial<CheckInInput> = {}): CheckInInput => ({
  date: FRI,
  weight: null,
  restingBpm: null,
  systolic: null,
  diastolic: null,
  bodyFat: null,
  waist: null,
  sleepHours: null,
  note: '',
  ...over,
});

const add = (d: SaveData, over: Partial<CheckInInput>, today = FRI, now = 10) => saveCheckIn(d, check(over), today, now);

describe('health check-ins', () => {
  it('reads typed measurements with a comma or a dot, and rejects typos', () => {
    expect(parseMeasurement('78,4', METRICS.weight)).toBe(78.4);
    expect(parseMeasurement('78.44', METRICS.weight)).toBe(78.4);
    expect(parseMeasurement(' 62 ', METRICS.restingBpm)).toBe(62);
    expect(parseMeasurement('', METRICS.weight)).toBeNull();
    expect(parseMeasurement('784', METRICS.weight)).toBe('invalid'); // a missing comma
    expect(parseMeasurement('abc', METRICS.weight)).toBe('invalid');
    expect(parseMeasurement('-5', METRICS.waist)).toBe('invalid');
  });

  it('keeps one check-in per day and lists them oldest first', () => {
    let d = add(emptySave(), { weight: 80, restingBpm: 64 });
    d = add(d, { date: '2026-11-13', weight: 80.6 }, FRI, 11);
    d = add(d, { weight: 79.8, restingBpm: 62 }, FRI, 12); // same day again: replaces
    expect(checkIns(d).map((e) => [e.date, e.weight])).toEqual([
      ['2026-11-13', 80.6],
      ['2026-11-20', 79.8],
    ]);
    expect(readings(checkIns(d), 'restingBpm')).toEqual([{ date: FRI, value: 62 }]);
    expect(latest(checkIns(d), 'weight')).toEqual({
      last: { date: FRI, value: 79.8 },
      previous: { date: '2026-11-13', value: 80.6 },
    });
    expect(latest(checkIns(d), 'waist')).toEqual({ last: null, previous: null });
  });

  it('ignores an empty check-in and one dated in the future', () => {
    expect(add(emptySave(), {})).toEqual(emptySave());
    expect(add(emptySave(), { date: '2026-11-21', weight: 80 })).toEqual(emptySave());
  });

  it('rewards one check-in per week with Vitality', () => {
    let d = add(emptySave(), { weight: 80 });
    expect(derive(d, FRI)).toMatchObject({ heroXp: 20, gold: 10 });
    expect(derive(d, FRI).stats.vit.total).toBe(20);
    d = add(d, { date: '2026-11-19', weight: 80.2 }, FRI, 11); // same week: no second reward
    expect(derive(d, FRI).heroXp).toBe(20);
    d = add(d, { date: '2026-11-27', weight: 79.5 }, '2026-11-27', 12); // next week
    expect(derive(d, '2026-11-27').heroXp).toBe(40);
    expect(checkedInThisWeek(d, '2026-11-27')).toBe(true);
    expect(checkedInThisWeek(d, '2026-12-01')).toBe(false);
  });

  it('gives nothing for filling in past weeks', () => {
    const d = add(emptySave(), { date: '2026-10-02', weight: 82 });
    expect(derive(d, FRI).heroXp).toBe(0);
    expect(checkIns(d).length).toBe(1);
  });

  it('earns the check-up title after four different weeks', () => {
    let d = emptySave();
    ['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11'].forEach((date, i) => {
      d = add(d, { date, weight: 80 - i }, date, 10 + i);
    });
    expect(derive(d, '2026-12-11').achievements.find((a) => a.id === 'checkup-4')?.earned).toBe(true);
  });

  it('deletes a check-in but keeps the reward already earned', () => {
    let d = add(emptySave(), { weight: 80 });
    d = deleteCheckIn(d, FRI, 20);
    expect(checkIns(d)).toEqual([]);
    expect(derive(d, FRI).heroXp).toBe(20);
  });

  it('works out BMI from weight and height', () => {
    expect(bmi(80, 180)).toBe(24.7);
    expect(saveHealthProfile(emptySave(), { heightCm: 180, goalWeight: 75 }, 5).healthProfile).toMatchObject({
      heightCm: 180,
      goalWeight: 75,
    });
  });

  it('merges check-ins from two devices and survives the save file', () => {
    const pc = add(emptySave(), { weight: 80 }, FRI, 100);
    const ipad = add(emptySave(), { date: '2026-11-18', restingBpm: 60 }, FRI, 200);
    const merged = mergeSaves(pc, ipad);
    expect(sameSave(merged, mergeSaves(ipad, pc))).toBe(true);
    expect(checkIns(merged).length).toBe(2);
    expect(derive(merged, FRI).heroXp).toBe(20); // one reward for the week, not two
    expect(sameSave(parseSave(serializeSave(merged)), merged)).toBe(true);
  });
});

describe('nightly sleep log', () => {
  it('reads sleep typed as a decimal or as hours and minutes', () => {
    expect(parseSleep('7,5')).toBe(7.5);
    expect(parseSleep('7.25')).toBe(7.25);
    expect(parseSleep('7:30')).toBe(7.5);
    expect(parseSleep('7h30')).toBe(7.5);
    expect(parseSleep('8h')).toBe(8);
    expect(parseSleep(' 6 h 45 min ')).toBe(6.75);
    expect(parseSleep('')).toBeNull();
    expect(parseSleep('25')).toBeNull();
    expect(parseSleep('7:75')).toBeNull();
    expect(parseSleep('lots')).toBeNull();
    expect(formatSleep(7.5)).toBe('7 h 30 min');
    expect(formatSleep(8)).toBe('8 h');
    expect(sleepInputText(6.75)).toBe('6:45');
  });

  it('keeps one entry per night and rewards logging last night once', () => {
    let d = saveSleep(emptySave(), FRI, 7.5, FRI, 10);
    d = saveSleep(d, FRI, 8, FRI, 11); // corrected: replaces, no second reward
    d = saveSleep(d, '2026-11-19', 6, FRI, 12); // an older night: recorded, no reward
    expect(sleepLogs(d).map((l) => [l.date, l.hours])).toEqual([
      ['2026-11-19', 6],
      [FRI, 8],
    ]);
    expect(derive(d, FRI)).toMatchObject({ heroXp: 3, gold: 2 });
    expect(derive(d, FRI).stats.vit.total).toBe(3);
    expect(saveSleep(d, '2026-11-21', 7, FRI, 13)).toBe(d); // not in the future
    expect(sleepLogs(deleteSleep(d, FRI, 20)).length).toBe(1);
  });

  it('averages the last seven nights, skipping nights that were not logged', () => {
    let d = emptySave();
    const nights: [string, number][] = [['2026-11-10', 5], ['2026-11-14', 6], ['2026-11-17', 7], ['2026-11-20', 8]];
    nights.forEach(([date, hours], i) => {
      d = saveSleep(d, date, hours, FRI, 10 + i);
    });
    const logs = sleepLogs(d);
    expect(averageSleep(logs, FRI)).toBe(7); // 14, 17 and 20 November
    expect(averageSleep(logs, '2026-11-12')).toBe(5);
    expect(averageSleep(logs, '2026-11-01')).toBeNull();
    expect(rollingSleep(logs).map((r) => r.value)).toEqual([5, 5.5, 6.5, 7]);
  });
});

describe('habit library and categories', () => {
  it('has a large library with unique habits, each in a known category', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThan(150);
    expect(new Set(ALL_TEMPLATES.map((t) => t.key)).size).toBe(ALL_TEMPLATES.length);
    expect(new Set(ALL_TEMPLATES.map((t) => t.name.toLowerCase())).size).toBe(ALL_TEMPLATES.length);
    const known = new Set(HABIT_CATEGORIES.map((c) => c.id));
    expect(ALL_TEMPLATES.every((t) => known.has(t.category) && t.target >= 1)).toBe(true);
    expect(TEMPLATE_GROUPS.every((g) => g.templates.length >= 10)).toBe(true);
    expect(SUGGESTED_TEMPLATES.every((key) => ALL_TEMPLATES.some((t) => t.key === key))).toBe(true);
  });

  it('adds picked library habits with their category', () => {
    const picked = ALL_TEMPLATES.filter((t) => ['sleep/In bed by 11pm', 'work/Plan the day'].includes(t.key));
    const d = actions.addTemplates(emptySave(), picked, FRI, 5);
    expect(Object.values(d.habits).map((h) => [h.name, h.category, h.stat]).sort()).toEqual([
      ['In bed by 11pm', 'sleep', 'vit'],
      ['Plan the day', 'work', 'foc'],
    ]);
  });

  it('places habits from before categories by name, or else by stat', () => {
    expect(categoryOf({ name: 'Read for 20 minutes', stat: 'int' })).toBe('reading');
    expect(categoryOf({ name: 'Drink 8 glasses of water', stat: 'vit' })).toBe('nutrition');
    expect(categoryOf({ name: 'My own thing', stat: 'str' })).toBe('exercise');
    expect(categoryOf({ name: 'My own thing', stat: 'for' })).toBe('home');
    expect(categoryOf({ name: 'Read for 20 minutes', stat: 'int', category: 'hobby' })).toBe('hobby');
    expect(categoryOf({ name: 'x', stat: 'int', category: 'no-such-category' })).toBe('other');
  });
});
