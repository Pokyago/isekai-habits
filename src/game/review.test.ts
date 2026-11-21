import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave } from '../data/merge';
import type { SaveData, Schedule } from '../data/types';
import { saveSleep } from '../health/health';
import * as money from '../money/actions';
import { setMeal, toggleMeal, mealId } from '../plan/meals';
import { firstWeek, moraleHistory, weekReview, weekVerdict, xpBetween } from './review';

// A Friday. Its week runs from Monday the 16th to Sunday the 22nd.
const TODAY = '2026-11-20';
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const BORN = '2026-10-01';
const T0 = Date.parse('2026-10-01T09:00:00');

/** "Daily" is due every day; "Three" on Mondays, Wednesdays and Fridays. */
function start(): { d: SaveData; daily: string; three: string } {
  let d = actions.createHero(emptySave(), 'Tester', 'mage', [], BORN, T0);
  const add = (name: string, schedule: Schedule, at: number) => {
    d = actions.saveHabit(d, { name, category: '', stat: 'str', difficulty: 'easy', schedule, target: 1 }, undefined, BORN, at);
  };
  add('Daily', { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] }, T0);
  add('Three', { kind: 'weekdays', days: [1, 3, 5] }, T0 + 1);
  const byName = (name: string) => Object.values(d.habits).find((h) => h.name === name)!.id;
  return { d, daily: byName('Daily'), three: byName('Three') };
}

describe('the week in review', () => {
  it('counts only the days so far in the current week', () => {
    const s = start();
    let d = s.d;
    for (const day of [MON, TUE, WED]) d = actions.setHabitCount(d, s.daily, day, 1, T0 + 10);
    d = actions.setHabitCount(d, s.three, MON, 1, T0 + 10);

    const week = weekReview(d, TODAY, TODAY);
    expect([week.start, week.end]).toEqual([MON, '2026-11-22']);
    expect(week.days.map((x) => x.ahead)).toEqual([false, false, false, false, false, true, true]);
    // Daily on five days, Three on Monday, Wednesday and Friday.
    expect([week.done, week.due]).toEqual([4, 8]);
    expect(week.share).toBe(0.5);
    // Monday (both done) and Tuesday (only Daily was due).
    expect(week.flawless).toBe(2);
    expect(week.habits.map((h) => [h.name, h.done, h.due])).toEqual([
      ['Three', 1, 3],
      ['Daily', 3, 5],
    ]);
    expect(week.xp).toBe(xpBetween(d, MON, TODAY));
    expect(week.xp).toBeGreaterThan(0);
  });

  it('looks back on a whole week that has passed', () => {
    const s = start();
    const last = weekReview(s.d, '2026-11-12', TODAY);
    expect([last.start, last.end]).toEqual(['2026-11-09', '2026-11-15']);
    expect(last.days.every((x) => !x.ahead)).toBe(true);
    expect([last.done, last.due, last.share, last.flawless]).toEqual([0, 10, 0, 0]);
    expect(last.morale).toBe(0);
  });

  it('counts a times-a-week habit against its number', () => {
    let d = actions.createHero(emptySave(), 'Tester', 'mage', [], BORN, T0);
    d = actions.saveHabit(d, { name: 'Gym', category: '', stat: 'str', difficulty: 'hard', schedule: { kind: 'perWeek', times: 3 }, target: 1 }, undefined, BORN, T0);
    const gym = Object.keys(d.habits)[0];
    d = actions.setHabitCount(d, gym, MON, 1, T0 + 10);
    d = actions.setHabitCount(d, gym, WED, 1, T0 + 11);
    expect(weekReview(d, TODAY, TODAY).habits).toEqual([{ id: gym, name: 'Gym', stat: 'str', due: 3, done: 2 }]);
  });

  it('adds up the rest of the week: quests, meals, sleep and money', () => {
    let d = start().d;
    d = actions.addQuest(d, 'Fix the tap', 'for', 'easy', T0 + 20);
    d = actions.toggleQuest(d, Object.keys(d.quests)[0], TUE, T0 + 21);
    d = setMeal(d, TODAY, 'lunch', 'Pasta', TODAY, T0 + 30);
    d = setMeal(d, TODAY, 'dinner', 'Soup', TODAY, T0 + 30);
    d = toggleMeal(d, mealId(TODAY, 'lunch'), TODAY, T0 + 31);
    d = saveSleep(d, TUE, 7, TODAY, T0 + 40);
    d = saveSleep(d, WED, 8, TODAY, T0 + 41);
    d = saveSleep(d, '2026-11-10', 4, TODAY, T0 + 42);
    d = money.setupMoney(d, 100_000, null, 'BRL', BORN, T0 + 50);
    const tx = (date: string, kind: 'expense' | 'income', amount: number, category: string) => {
      d = money.saveTransaction(d, { date, kind, amount, category, note: '', goalId: null, debtId: null }, undefined, TODAY, T0 + 60);
    };
    tx(TUE, 'expense', 5_000, 'food');
    tx(WED, 'expense', 20_000, 'savings');
    tx(WED, 'income', 300_000, 'salary');
    tx('2026-11-10', 'expense', 9_900, 'food');

    const week = weekReview(d, TODAY, TODAY);
    expect(week.quests).toBe(1);
    expect([week.mealsEaten, week.mealsPlanned]).toEqual([1, 2]);
    expect([week.sleepNights, week.sleepAverage]).toEqual([2, 7.5]);
    // Money put aside is not spending, and last week's lunch is not this week's.
    expect(week.money).toEqual({ spent: 5_000, income: 300_000 });
    expect(weekReview(start().d, TODAY, TODAY).money).toBeNull();
  });

  it('has a word for every kind of week', () => {
    expect(new Set([null, 1, 0.75, 0.5, 0.1].map(weekVerdict)).size).toBe(5);
  });
});

describe('her morale over time', () => {
  it('goes back four weeks, but not past the day she was summoned', () => {
    const d = start().d;
    const history = moraleHistory(d, TODAY);
    expect(history).toHaveLength(28);
    expect(history[27].date).toBe(TODAY);
    expect(history[0].date).toBe('2026-10-24');

    const young = moraleHistory(d, '2026-10-03');
    expect(young.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    // She arrives in good spirits; neglect then wears her down.
    expect(young[0].value).toBe(70);
    expect(history[27].value).toBe(0);
    expect(firstWeek(d, TODAY)).toBe('2026-09-28');
  });
});
