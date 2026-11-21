import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave } from '../data/merge';
import type { DateStr, SaveData, Schedule } from '../data/types';
import { setHabitChoice } from '../plan/plan';
import { addDays } from './dates';
import { careDay, companion, companionLine, moodFor } from './companion';

const BORN = '2026-10-01';
const TODAY = '2026-11-20';
const T0 = Date.parse('2026-10-01T09:00:00');
const EVERY_DAY: Schedule = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };

/** A hero summoned long ago, with habits that started on the same day. */
function start(schedules: Schedule[] = [EVERY_DAY, EVERY_DAY], born: DateStr = BORN, now = T0): SaveData {
  let d = actions.createHero(emptySave(), 'Tester', 'mage', [], born, now);
  schedules.forEach((schedule, i) => {
    d = actions.saveHabit(
      d,
      { name: `Habit ${i}`, category: '', stat: 'str', difficulty: 'easy', schedule, target: 1 },
      undefined,
      born,
      now + i,
    );
  });
  return d;
}

const ids = (d: SaveData) => Object.keys(d.habits).sort();

/** Does every habit on each of the days. */
function doAll(d: SaveData, dates: DateStr[]): SaveData {
  for (const date of dates) for (const id of ids(d)) d = actions.setHabitCount(d, id, date, 1, T0 + 1000);
  return d;
}

/** The days before today, most recent first: daysAgo(1, 3) is yesterday back to three days ago. */
const daysAgo = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => addDays(TODAY, -(from + i)));

describe('the heroine’s mood', () => {
  it('has a mood for every morale', () => {
    expect([100, 85, 84, 65, 64, 40, 39, 20, 19, 0].map(moodFor)).toEqual([
      'radiant',
      'radiant',
      'cheerful',
      'cheerful',
      'steady',
      'steady',
      'tired',
      'tired',
      'exhausted',
      'exhausted',
    ]);
  });

  it('is radiant after a week of doing everything', () => {
    const c = companion(doAll(start(), daysAgo(1, 7)), TODAY);
    expect(c.morale).toBe(100);
    expect(c.mood).toBe('radiant');
    expect(c.week.map((d) => `${d.done}/${d.due}`)).toEqual(Array(7).fill('2/2'));
    expect(c.week[6].date).toBe(addDays(TODAY, -1));
  });

  it('drops about one mood for each day that is missed', () => {
    const moods = [0, 1, 2, 3, 4].map((missed) => companion(doAll(start(), daysAgo(missed + 1, 7)), TODAY).mood);
    expect(moods).toEqual(['radiant', 'cheerful', 'steady', 'tired', 'exhausted']);
  });

  it('counts a half-done day as half', () => {
    let d = start();
    const [first] = ids(d);
    for (const date of daysAgo(1, 7)) d = actions.setHabitCount(d, first, date, 1, T0 + 1000);
    expect(companion(d, TODAY).morale).toBe(50);
  });

  it('does not hold today against her before it is over, and lets today lift her', () => {
    const neglected = start();
    const morning = companion(neglected, TODAY);
    expect(morning.morale).toBe(0);
    expect(morning.today).toEqual({ date: TODAY, due: 2, done: 0 });

    const oneDone = companion(actions.setHabitCount(neglected, ids(neglected)[0], TODAY, 1, T0 + 1000), TODAY);
    const allDone = companion(doAll(neglected, [TODAY]), TODAY);
    expect(oneDone.morale).toBeGreaterThan(morning.morale);
    expect(allDone.morale).toBeGreaterThan(oneDone.morale);
    expect(allDone.mood).toBe('tired');

    // After a perfect week, an untouched morning still shows her at her best.
    expect(companion(doAll(start(), daysAgo(1, 7)), TODAY).morale).toBe(100);
  });

  it('comes back a mood at a time when the habits are kept again', () => {
    let d = start();
    const moods: string[] = [];
    for (let i = 0; i < 5; i++) {
      const day = addDays(TODAY, i);
      d = doAll(d, [day]);
      moods.push(companion(d, day).mood);
    }
    expect(moods).toEqual(['tired', 'steady', 'cheerful', 'cheerful', 'radiant']);
  });

  it('starts out cheerful, and the day of the summoning is not held against her', () => {
    const fresh = start([EVERY_DAY], TODAY, Date.parse('2026-11-20T09:00:00'));
    expect(companion(fresh, TODAY).mood).toBe('cheerful');
    expect(companion(fresh, addDays(TODAY, 1)).mood).toBe('cheerful');
    // But the days after it are.
    expect(companion(fresh, addDays(TODAY, 3)).morale).toBeLessThan(companion(fresh, addDays(TODAY, 1)).morale);
  });

  it('leaves out days with nothing to do, and habits skipped while planning', () => {
    // A habit for Mondays only: the other days neither help nor hurt.
    const monday = '2026-11-16';
    let d = start([{ kind: 'weekdays', days: [1] }]);
    d = doAll(d, [monday]);
    const c = companion(d, TODAY);
    expect(c.week.filter((day) => day.due > 0).map((day) => day.date)).toEqual([monday]);
    expect(c.morale).toBe(100);

    // Skipping a habit for tomorrow takes it off that day.
    let e = start();
    const tomorrow = addDays(TODAY, 1);
    e = setHabitChoice(e, ids(e)[0], tomorrow, 'skip', TODAY, T0 + 2000);
    expect(careDay(e, tomorrow)).toEqual({ date: tomorrow, due: 1, done: 0 });
  });

  it('counts a times-a-week habit only on the days it was done', () => {
    let d = start([{ kind: 'perWeek', times: 3 }]);
    expect(careDay(d, TODAY)).toEqual({ date: TODAY, due: 0, done: 0 });
    d = doAll(d, [TODAY]);
    expect(careDay(d, TODAY)).toEqual({ date: TODAY, due: 1, done: 1 });
  });

  it('with no habits at all, she simply waits in good spirits', () => {
    const c = companion(start([]), TODAY);
    expect(c.mood).toBe('cheerful');
    expect(companionLine(c)).toMatch(/Nothing to do today/);
  });
});

describe('what she says', () => {
  it('follows how today is going', () => {
    const d = doAll(start(), daysAgo(1, 7));
    expect(companionLine(companion(d, TODAY))).toBe('I’m full of energy. What’s first?');
    const one = actions.setHabitCount(d, ids(d)[0], TODAY, 1, T0 + 1000);
    expect(companionLine(companion(one, TODAY))).toBe('1 to go. We’ve got this!');
    expect(companionLine(companion(doAll(d, [TODAY]), TODAY))).toBe('Everything done! I feel unstoppable.');
  });

  it('asks for help when she is worn out', () => {
    expect(companionLine(companion(start(), TODAY))).toMatch(/Just one habit/);
  });
});
