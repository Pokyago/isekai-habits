import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { Difficulty, SaveData, Schedule } from '../data/types';
import { BOSS_REWARD, bossFor, bossesDefeated } from '../game/boss';
import { companion, companionLine, missedYesterday } from '../game/companion';
import { derive } from '../game/derive';
import { xpBetween } from '../game/review';
import { deleteRoutine, routineSteps, routines, saveRoutine } from '../game/routines';
import { ownedItems, wearItem, buyItem } from '../game/wardrobe';
import { addPlanItem, planFor, setHabitChoice, setMainGoal, togglePlanItem } from './plan';
import {
  WEEK_PLAN_REWARD,
  addRepeat,
  addRepeats,
  addWeekGoal,
  copyWeek,
  deleteRepeat,
  isRepeated,
  repeats,
  deleteWeekGoal,
  renameWeekGoal,
  settleWeekPlan,
  toggleWeekGoal,
  weekGoalReward,
  weekGoals,
  weekPlan,
} from './week';

// A Friday. Its week is Monday the 16th to Sunday the 22nd; the next starts on the 23rd.
const TODAY = '2026-11-20';
const MON = '2026-11-16';
const NEXT = '2026-11-23';
const BORN = '2026-10-01';
const T0 = Date.parse('2026-10-01T09:00:00');
const DAILY: Schedule = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };

const hero = () => actions.createHero(emptySave(), 'Tester', 'mage', [], BORN, T0);
function withHabit(d: SaveData, name: string, difficulty: Difficulty = 'easy', schedule: Schedule = DAILY, why?: string): SaveData {
  return actions.saveHabit(d, { name, category: '', stat: 'str', difficulty, schedule, target: 1, why }, undefined, BORN, T0 + Object.keys(d.habits).length);
}
const idOf = (d: SaveData, name: string) => Object.values(d.habits).find((h) => h.name === name)!.id;
const tick = (d: SaveData, name: string, date: string) => actions.setHabitCount(d, idOf(d, name), date, 1, T0 + 100);
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(Number(from.slice(8)) + i).padStart(2, '0')}`);

describe('goals for the week', () => {
  it('holds up to three, in the order written, and not for a week that is over', () => {
    let d = hero();
    for (const title of ['Run three times', ' Finish the report ', 'Call mum', 'A fourth']) d = addWeekGoal(d, TODAY, title, TODAY, T0 + Object.keys(d.weekGoals).length);
    expect(weekGoals(d, MON).map((g) => g.title)).toEqual(['Run three times', 'Finish the report', 'Call mum']);
    expect(weekGoals(d, NEXT)).toEqual([]);
    expect(addWeekGoal(d, '2026-11-10', 'Too late', TODAY, T0 + 9)).toBe(d);
    const empty = hero();
    expect(addWeekGoal(empty, TODAY, '   ', TODAY, T0)).toBe(empty);
  });

  it('earns as much as a Medium quest when achieved, and gives it back when unticked', () => {
    let d = addWeekGoal(hero(), TODAY, 'Run three times', TODAY, T0 + 1);
    const id = Object.keys(d.weekGoals)[0];
    expect(weekGoalReward(d)).toEqual({ xp: 20, gold: 10 });
    d = toggleWeekGoal(d, id, TODAY, T0 + 2);
    expect(d.weekGoals[id]).toMatchObject({ done: true, doneDate: TODAY, xp: 20, gold: 10 });
    let game = derive(d, TODAY);
    expect([game.heroXp, game.stats.foc.total, game.gold]).toEqual([20, 20, 10]);
    expect(xpBetween(d, MON, TODAY)).toBe(20);

    d = toggleWeekGoal(d, id, TODAY, T0 + 3);
    game = derive(d, TODAY);
    expect([game.heroXp, game.gold]).toEqual([0, 0]);
  });

  it('cannot be ticked before its week begins, and an achieved one cannot be removed to make room', () => {
    let d = addWeekGoal(hero(), NEXT, 'Next week’s goal', TODAY, T0 + 1);
    const id = Object.keys(d.weekGoals)[0];
    expect(toggleWeekGoal(d, id, TODAY, T0 + 2)).toBe(d);
    d = renameWeekGoal(d, id, 'Reworded', T0 + 3);
    d = toggleWeekGoal(d, id, NEXT, T0 + 4);
    expect(d.weekGoals[id]).toMatchObject({ title: 'Reworded', done: true });
    expect(deleteWeekGoal(d, id, T0 + 5)).toBe(d);

    let e = addWeekGoal(hero(), TODAY, 'Drop me', TODAY, T0 + 1);
    e = deleteWeekGoal(e, Object.keys(e.weekGoals)[0], T0 + 2);
    expect(weekGoals(e, MON)).toEqual([]);
  });

  it('survives the save file, opens a save from before, and merges', () => {
    const d = addWeekGoal(hero(), TODAY, 'Run three times', TODAY, T0 + 1);
    expect(sameSave(parseSave(serializeSave(d)), d)).toBe(true);
    const old = JSON.parse(serializeSave(hero()));
    delete old.weekGoals;
    delete old.routines;
    old.version = 10;
    expect(parseSave(JSON.stringify(old))).toMatchObject({ version: 12, weekGoals: {}, routines: {} });
    const other = addWeekGoal(hero(), TODAY, 'Call mum', TODAY, T0 + 2);
    expect(weekGoals(mergeSaves(d, other), MON)).toHaveLength(2);
  });
});

describe('planning the week', () => {
  const plannedNext = () => {
    let d = addWeekGoal(hero(), NEXT, 'Run three times', TODAY, T0 + 1);
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-25']) d = setMainGoal(d, date, `Goal for ${date}`, TODAY, T0 + 2);
    return d;
  };

  it('counts as planned with a goal for the week and a main goal on three of its days', () => {
    let d = addWeekGoal(hero(), NEXT, 'Run three times', TODAY, T0 + 1);
    d = setMainGoal(d, '2026-11-23', 'One', TODAY, T0 + 2);
    d = setMainGoal(d, '2026-11-24', 'Two', TODAY, T0 + 2);
    expect(weekPlan(d, NEXT, TODAY)).toMatchObject({ week: NEXT, mainDays: 2, ready: false, rewarded: false, inTime: true });
    expect(settleWeekPlan(d, NEXT, TODAY, T0 + 3)).toBe(d);
    expect(weekPlan(plannedNext(), '2026-11-27', TODAY)).toMatchObject({ mainDays: 3, ready: true });
  });

  it('is rewarded once, when it is planned before its Monday is over', () => {
    let d = settleWeekPlan(plannedNext(), NEXT, TODAY, T0 + 3);
    expect(d.claims[`weekplan|${NEXT}`]).toMatchObject({ claimed: true, ...WEEK_PLAN_REWARD, stat: 'foc', date: TODAY });
    expect(weekPlan(d, NEXT, TODAY).rewarded).toBe(true);
    expect(derive(d, TODAY).heroXp).toBe(WEEK_PLAN_REWARD.xp);
    expect(settleWeekPlan(d, NEXT, TODAY, T0 + 4)).toBe(d);

    // On the Monday itself is still in time; on the Tuesday it is not.
    expect(settleWeekPlan(plannedNext(), NEXT, NEXT, T0 + 3).claims[`weekplan|${NEXT}`]?.claimed).toBe(true);
    d = plannedNext();
    expect(settleWeekPlan(d, NEXT, '2026-11-24', T0 + 3)).toBe(d);
  });
});

describe('the weekly boss', () => {
  it('has a share of what the week’s habits could do, and is the same boss all week', () => {
    // An Easy daily habit hits for 2: fourteen in a week, so the boss has ten.
    const d = withHabit(hero(), 'Read');
    const boss = bossFor(d, TODAY, TODAY)!;
    expect(boss).toMatchObject({ week: MON, maxHp: 10, hp: 10, damage: 0, defeated: false, daysLeft: 3, claimed: false });
    expect(bossFor(d, MON, TODAY)!.name).toBe(boss.name);
    expect(bossFor(hero(), TODAY, TODAY)).toBeNull();
    expect(bossFor(d, NEXT, TODAY)).toMatchObject({ week: NEXT, daysLeft: 7 });
    expect(bossFor(d, '2026-11-10', TODAY)!.daysLeft).toBe(0);
  });

  it('is hurt more by harder habits, and by a times-a-week habit up to its number', () => {
    let d = withHabit(withHabit(hero(), 'Read'), 'Gym', 'hard', { kind: 'perWeek', times: 2 });
    // Read 14 and Gym 10 make 24; seventy percent, rounded up, is 17.
    expect(bossFor(d, TODAY, TODAY)!.maxHp).toBe(17);
    d = tick(d, 'Read', MON);
    for (const date of days(MON, 3)) d = tick(d, 'Gym', date);
    expect(bossFor(d, TODAY, TODAY)).toMatchObject({ damage: 2 + 10, hp: 5 });
  });

  it('gives its chest when beaten, takes it back if a habit is unticked, and leaves a skipped habit out', () => {
    let d = withHabit(hero(), 'Read');
    for (const date of days(MON, 4)) d = tick(d, 'Read', date);
    expect(bossFor(d, TODAY, TODAY)).toMatchObject({ damage: 8, defeated: false });
    expect(bossesDefeated(d)).toBe(0);
    const before = derive(d, TODAY);

    d = tick(d, 'Read', TODAY);
    expect(bossFor(d, TODAY, TODAY)).toMatchObject({ hp: 0, defeated: true, claimed: true });
    expect(bossesDefeated(d)).toBe(1);
    const after = derive(d, TODAY);
    expect(after.bossesDefeated).toBe(1);
    expect(after.goldEarned - before.goldEarned).toBeGreaterThanOrEqual(BOSS_REWARD.gold);
    expect(after.achievements.find((a) => a.id === 'boss-1')?.earned).toBe(true);

    d = actions.setHabitCount(d, idOf(d, 'Read'), TODAY, 0, T0 + 200);
    expect(bossFor(d, TODAY, TODAY)).toMatchObject({ defeated: false, claimed: false });
    expect(bossesDefeated(d)).toBe(0);

    // Skipping the habit for Sunday takes that day out of what the boss can have.
    const skipped = setHabitChoice(withHabit(hero(), 'Read'), idOf(d, 'Read'), '2026-11-22', 'skip', TODAY, T0 + 300);
    expect(bossFor(withHabit(hero(), 'Read'), TODAY, TODAY)!.maxHp).toBe(10);
    expect(skipped).toBeDefined();
  });

  it('unlocks trophies for her wardrobe that gold cannot buy', () => {
    let d = withHabit(hero(), 'Read');
    expect(ownedItems(d).has('clip-horns')).toBe(false);
    expect(buyItem(d, 'clip-horns', 99_999, TODAY, T0 + 1)).toBe(d);
    expect(wearItem(d, 'clip-horns', T0 + 1)).toBe(d);
    for (const date of days(MON, 5)) d = tick(d, 'Read', date);
    expect(ownedItems(d).has('clip-horns')).toBe(true);
    expect(ownedItems(d).has('cape-shadow')).toBe(false);
    expect(wearItem(d, 'clip-horns', T0 + 2).wardrobe?.worn.clip).toBe('clip-horns');
  });
});

describe('routines', () => {
  it('keep their habits in order and step through the ones to be done that day', () => {
    let d = withHabit(withHabit(withHabit(hero(), 'Shower'), 'Brush teeth'), 'Run', 'hard', { kind: 'weekdays', days: [1] });
    d = saveRoutine(d, { name: ' Morning ', habitIds: [idOf(d, 'Run'), idOf(d, 'Brush teeth'), idOf(d, 'Shower'), 'gone', idOf(d, 'Shower')] }, undefined, T0 + 10, 'r1');
    expect(routines(d).map((r) => [r.name, r.habitIds.length])).toEqual([['Morning', 3]]);
    // Friday: the Monday-only run is left out.
    expect(routineSteps(d, d.routines.r1, TODAY).map((s) => [s.habit.name, s.done])).toEqual([
      ['Brush teeth', false],
      ['Shower', false],
    ]);
    expect(routineSteps(d, d.routines.r1, MON).map((s) => s.habit.name)).toEqual(['Run', 'Brush teeth', 'Shower']);
    d = tick(d, 'Shower', TODAY);
    expect(routineSteps(d, d.routines.r1, TODAY).map((s) => s.done)).toEqual([false, true]);

    d = saveRoutine(d, { name: 'Wake up', habitIds: [idOf(d, 'Shower')] }, 'r1', T0 + 20);
    expect(routines(d).map((r) => r.name)).toEqual(['Wake up']);
    expect(saveRoutine(d, { name: 'Empty', habitIds: [] }, undefined, T0 + 30)).toBe(d);
    expect(routines(deleteRoutine(d, 'r1', T0 + 40))).toEqual([]);
  });
});

describe('not missing twice', () => {
  it('points at a habit missed yesterday that is still open today', () => {
    let d = withHabit(withHabit(hero(), 'Read'), 'Stretch');
    for (const date of days('2026-11-13', 6)) d = tick(d, 'Stretch', date);
    for (const date of days('2026-11-13', 6)) d = tick(d, 'Read', date);
    d = tick(d, 'Stretch', '2026-11-19');
    // Yesterday Read was missed; today both are open.
    expect(missedYesterday(d, TODAY).map((h) => h.name)).toEqual(['Read']);
    expect(companion(d, TODAY).slipped).toEqual(['Read']);
    expect(companionLine(companion(d, TODAY))).toBe('“Read” slipped yesterday. Not twice?');

    d = tick(d, 'Read', TODAY);
    expect(missedYesterday(d, TODAY)).toEqual([]);
    expect(companionLine(companion(d, TODAY))).not.toMatch(/slipped/);
  });

  it('leaves out a habit that was skipped yesterday on purpose, and keeps the reason with the habit', () => {
    let d = withHabit(hero(), 'Read', 'easy', DAILY, '  To finish one book a month ');
    expect(Object.values(d.habits)[0].why).toBe('To finish one book a month');
    d = setHabitChoice(d, idOf(d, 'Read'), '2026-11-19', 'skip', '2026-11-19', T0 + 5);
    expect(missedYesterday(d, TODAY)).toEqual([]);
    // Clearing the reason removes it.
    d = actions.saveHabit(d, { name: 'Read', category: '', stat: 'str', difficulty: 'easy', schedule: DAILY, target: 1, why: ' ' }, idOf(d, 'Read'), TODAY, T0 + 6);
    expect(Object.values(d.habits)[0].why).toBeUndefined();
    expect(sameSave(parseSave(serializeSave(d)), d)).toBe(true);
  });
});

describe('starting a week from the one before', () => {
  const lastWeek = () => {
    // Planned from the 9th, a Monday, for that same week.
    const on = '2026-11-09';
    let d = hero();
    d = setMainGoal(d, '2026-11-09', 'Report', on, T0 + 1);
    d = setMainGoal(d, '2026-11-11', 'Gym', on, T0 + 1);
    d = addPlanItem(d, '2026-11-09', { title: 'Dentist', time: '09:30' }, T0 + 2, 'a');
    d = addPlanItem(d, '2026-11-15', { title: 'Call mum', time: null }, T0 + 2, 'b');
    d = addWeekGoal(d, '2026-11-09', 'Run three times', on, T0 + 3);
    return d;
  };
  const titles = (d: SaveData, date: string) => {
    const p = planFor(d, date);
    return [p.main?.title ?? null, ...p.items.map((i) => (i.time ? `${i.time} ${i.title}` : i.title))];
  };

  it('copies main goals, goals with their times, and the goals for the week, onto the same weekdays', () => {
    // On Sunday the 15th, planning the week of the 16th.
    const d = copyWeek(lastWeek(), '2026-11-09', MON, '2026-11-15', T0 + 10);
    expect(titles(d, '2026-11-16')).toEqual(['Report', '09:30 Dentist']);
    expect(titles(d, '2026-11-18')).toEqual(['Gym']);
    expect(titles(d, '2026-11-22')).toEqual([null, 'Call mum']);
    expect(weekGoals(d, MON).map((g) => g.title)).toEqual(['Run three times']);
    // Nothing is ticked: it is a fresh week.
    expect(planFor(d, '2026-11-16').main?.done).toBe(false);
  });

  it('keeps what the week already has, never doubles up, and leaves days that have passed', () => {
    let d = lastWeek();
    d = setMainGoal(d, '2026-11-16', 'My own goal', '2026-11-15', T0 + 5);
    d = addPlanItem(d, '2026-11-16', { title: 'Dentist', time: null }, T0 + 6, 'c');
    d = addWeekGoal(d, MON, 'Already here', '2026-11-15', T0 + 7);
    const once = copyWeek(d, '2026-11-09', MON, '2026-11-15', T0 + 10);
    expect(titles(once, '2026-11-16')).toEqual(['My own goal', 'Dentist']);
    expect(weekGoals(once, MON).map((g) => g.title)).toEqual(['Already here']);
    expect(copyWeek(once, '2026-11-09', MON, '2026-11-15', T0 + 11)).toBe(once);

    // Copied on the Friday: Monday to Thursday have passed.
    const late = copyWeek(lastWeek(), '2026-11-09', MON, TODAY, T0 + 10);
    expect(titles(late, '2026-11-16')).toEqual([null]);
    expect(titles(late, '2026-11-22')).toEqual([null, 'Call mum']);
  });
});

describe('goals that repeat on a weekday', () => {
  it('are put on that weekday for the next two weeks, and again as time goes by', () => {
    // Tuesdays, made on Friday the 20th.
    let d = addRepeat(hero(), { title: ' Therapy ', weekday: 2, time: '18:00' }, TODAY, T0 + 1, 'r');
    expect(repeats(d).map((r) => [r.title, r.weekday, r.time, r.since])).toEqual([['Therapy', 2, '18:00', TODAY]]);
    const on = (x: SaveData) => Object.values(x.plan).filter((p) => !p.deleted && isRepeated(p)).map((p) => p.date).sort();
    expect(on(d)).toEqual(['2026-11-24', '2026-12-01']);
    expect(planFor(d, '2026-11-24').items[0]).toMatchObject({ title: 'Therapy', time: '18:00', done: false });
    expect(addRepeats(d, TODAY, T0 + 2)).toBe(d);
    d = addRepeats(d, '2026-11-27', T0 + 3);
    expect(on(d)).toEqual(['2026-11-24', '2026-12-01', '2026-12-08']);
  });

  it('stay off a day they were removed from, and stop when the repeat is removed', () => {
    let d = addRepeat(hero(), { title: 'Therapy', weekday: 2, time: null }, TODAY, T0 + 1, 'r');
    d = togglePlanItem(d, 'rep|r|2026-11-24', '2026-11-24', T0 + 2);
    d = deleteRepeat(d, 'r', '2026-11-24', T0 + 3);
    expect(repeats(d)).toEqual([]);
    // The one that was done stays; the one still ahead is taken off; nothing new is added.
    expect(planFor(d, '2026-11-24').items.map((p) => p.done)).toEqual([true]);
    expect(planFor(d, '2026-12-01').items).toEqual([]);
    expect(addRepeats(d, '2026-11-30', T0 + 4)).toBe(d);
  });

  it('are not copied with the week, since they come back by themselves', () => {
    let d = addRepeat(hero(), { title: 'Therapy', weekday: 2, time: null }, '2026-11-09', T0 + 1, 'r');
    d = addPlanItem(d, '2026-11-10', { title: 'Buy bread', time: null }, T0 + 2, 'x');
    d = copyWeek(d, '2026-11-09', MON, '2026-11-15', T0 + 3);
    expect(planFor(d, '2026-11-17').items.map((p) => p.title).sort()).toEqual(['Buy bread', 'Therapy']);
  });

  it('survive the save file and merge', () => {
    const d = addRepeat(hero(), { title: 'Therapy', weekday: 2, time: null }, TODAY, T0 + 1, 'r');
    expect(sameSave(parseSave(serializeSave(d)), d)).toBe(true);
    const other = addRepeat(hero(), { title: 'Therapy', weekday: 2, time: null }, TODAY, T0 + 1, 'r');
    expect(Object.values(mergeSaves(d, other).plan).filter((p) => isRepeated(p))).toHaveLength(2);
  });
});
