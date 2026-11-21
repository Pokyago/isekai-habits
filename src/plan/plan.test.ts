import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { derive } from '../game/derive';
import * as money from '../money/actions';
import { dueHabits, isDueOn } from '../game/schedule';
import { walkStreaks } from '../game/streaks';
import {
  habitChoices,
  planQuest,
  setHabitChoice,
  PLAN_AHEAD_REWARD,
  REWARDED_GOALS,
  addPlanItem,
  deletePlanItem,
  hasPlan,
  hoursAsleep,
  isTime,
  mainId,
  moneyDue,
  movePlanItem,
  planFor,
  planProgress,
  saveDay,
  setMainGoal,
  shiftTime,
  togglePlanItem,
  unfinishedBefore,
  updatePlanItem,
} from './plan';

const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const T0 = Date.parse('2026-11-20T09:00:00');

/** A save with a hero whose class does not boost Focus, so rewards are the plain amounts. */
const start = (): SaveData => actions.createHero(emptySave(), 'Tester', 'warrior', [], TODAY, T0);

const add = (data: SaveData, date: string, title: string, id: string, time: string | null = null, at = T0) =>
  addPlanItem(data, date, { title, time }, at, id);

describe('clock times', () => {
  it('recognises HH:MM and nothing else', () => {
    expect(isTime('06:30')).toBe(true);
    expect(isTime('23:59')).toBe(true);
    expect(isTime('24:00')).toBe(false);
    expect(isTime('6:30')).toBe(false);
    expect(isTime('')).toBe(false);
    expect(isTime(null)).toBe(false);
  });

  it('moves a time across midnight', () => {
    expect(shiftTime('06:30', -8)).toBe('22:30');
    expect(shiftTime('23:00', 7.5)).toBe('06:30');
    expect(shiftTime('12:00', 0)).toBe('12:00');
  });

  it('measures a night from bedtime to waking', () => {
    expect(hoursAsleep('23:00', '06:30')).toBe(7.5);
    expect(hoursAsleep('00:30', '07:00')).toBe(6.5);
    expect(hoursAsleep('22:00', '06:00')).toBe(8);
  });
});

describe('main goal', () => {
  it('is set, reworded and cleared for a day', () => {
    let d = setMainGoal(start(), TOMORROW, '  Finish the report  ', TODAY, T0);
    expect(planFor(d, TOMORROW).main?.title).toBe('Finish the report');
    expect(planFor(d, TOMORROW).main?.id).toBe(mainId(TOMORROW));

    d = setMainGoal(d, TOMORROW, 'Send the report', TODAY, T0 + 10);
    expect(planFor(d, TOMORROW).main?.title).toBe('Send the report');
    expect(Object.keys(d.plan)).toHaveLength(1);

    d = setMainGoal(d, TOMORROW, '   ', TODAY, T0 + 20);
    expect(planFor(d, TOMORROW).main).toBeNull();
  });

  it('cannot be set for a day that has passed', () => {
    const d = start();
    expect(setMainGoal(d, '2026-11-19', 'Too late', TODAY, T0)).toBe(d);
  });

  it('rewards planning tomorrow the day before, once', () => {
    const before = derive(start(), TODAY);
    let d = setMainGoal(start(), TOMORROW, 'Finish the report', TODAY, T0);
    expect(derive(d, TODAY).heroXp - before.heroXp).toBe(PLAN_AHEAD_REWARD.xp);
    expect(derive(d, TODAY).stats.foc.total).toBe(PLAN_AHEAD_REWARD.xp);

    // Rewording it, or clearing and setting it again, does not earn it twice.
    d = setMainGoal(d, TOMORROW, 'Something else', TODAY, T0 + 10);
    d = setMainGoal(d, TOMORROW, '', TODAY, T0 + 20);
    d = setMainGoal(d, TOMORROW, 'Back again', TODAY, T0 + 30);
    expect(derive(d, TODAY).heroXp - before.heroXp).toBe(PLAN_AHEAD_REWARD.xp);
  });

  it('gives no planning reward for today or for days further out', () => {
    let d = setMainGoal(start(), TODAY, 'Do it now', TODAY, T0);
    d = setMainGoal(d, '2026-11-25', 'Next week', TODAY, T0);
    expect(derive(d, TODAY).heroXp).toBe(0);
  });

  it('earns its reward when achieved, and gives it back when unticked', () => {
    let d = setMainGoal(start(), TODAY, 'Do it now', TODAY, T0);
    d = togglePlanItem(d, mainId(TODAY), TODAY, T0 + 10);
    expect(planFor(d, TODAY).main?.done).toBe(true);
    expect(derive(d, TODAY).heroXp).toBe(20);
    expect(derive(d, TODAY).gold).toBe(10);
    expect(derive(d, TODAY).mainGoalsDone).toBe(1);
    expect(derive(d, TODAY).achievements.find((a) => a.id === 'plan-1')?.earned).toBe(true);

    d = togglePlanItem(d, mainId(TODAY), TODAY, T0 + 20);
    expect(derive(d, TODAY).heroXp).toBe(0);
  });

  it('cannot be ticked before its day', () => {
    const d = setMainGoal(start(), TOMORROW, 'Tomorrow’s job', TODAY, T0);
    expect(togglePlanItem(d, mainId(TOMORROW), TODAY, T0 + 10)).toBe(d);
    expect(togglePlanItem(d, mainId(TOMORROW), TOMORROW, T0 + 10)).not.toBe(d);
  });

  it('stays in place once achieved', () => {
    let d = setMainGoal(start(), TODAY, 'Do it now', TODAY, T0);
    d = togglePlanItem(d, mainId(TODAY), TODAY, T0 + 10);
    expect(setMainGoal(d, TODAY, '', TODAY, T0 + 20)).toBe(d);
    expect(deletePlanItem(d, mainId(TODAY), T0 + 20)).toBe(d);
  });

  it('gets the class bonus for a Focus class', () => {
    let d = actions.createHero(emptySave(), 'Tester', 'ranger', [], TODAY, T0);
    d = setMainGoal(d, TODAY, 'Do it now', TODAY, T0);
    d = togglePlanItem(d, mainId(TODAY), TODAY, T0 + 10);
    expect(derive(d, TODAY).heroXp).toBe(22);
  });
});

describe('other goals', () => {
  it('lists timed ones first in time order, then the rest as added', () => {
    let d = start();
    d = add(d, TODAY, 'Untimed first', 'a', null, T0);
    d = add(d, TODAY, 'Afternoon', 'b', '15:00', T0 + 1);
    d = add(d, TODAY, 'Morning', 'c', '08:30', T0 + 2);
    d = add(d, TODAY, 'Untimed second', 'd', null, T0 + 3);
    d = add(d, TOMORROW, 'Another day', 'e', '07:00', T0 + 4);
    expect(planFor(d, TODAY).items.map((p) => p.title)).toEqual(['Morning', 'Afternoon', 'Untimed first', 'Untimed second']);
  });

  it('ignores an empty title and a time that is not a time', () => {
    const d = start();
    expect(add(d, TODAY, '   ', 'a')).toBe(d);
    expect(planFor(add(d, TODAY, 'Call', 'a', '25:99'), TODAY).items[0].time).toBeNull();
  });

  it('can be reworded and retimed', () => {
    let d = add(start(), TODAY, 'Call', 'a');
    d = updatePlanItem(d, 'a', { title: 'Call the dentist', time: '10:00' }, T0 + 10);
    expect(planFor(d, TODAY).items[0]).toMatchObject({ title: 'Call the dentist', time: '10:00' });
    expect(updatePlanItem(d, 'a', { title: 'Call the dentist', time: '10:00' }, T0 + 20)).toBe(d);
    expect(updatePlanItem(d, 'a', { title: ' ', time: null }, T0 + 20)).toBe(d);
  });

  it('reward only the first few finished in a day', () => {
    let d = start();
    for (let i = 0; i < REWARDED_GOALS + 2; i++) d = add(d, TODAY, `Goal ${i}`, `g${i}`, null, T0 + i);
    for (let i = 0; i < REWARDED_GOALS + 2; i++) d = togglePlanItem(d, `g${i}`, TODAY, T0 + 100 + i);
    expect(derive(d, TODAY).heroXp).toBe(REWARDED_GOALS * 10);
    expect(planProgress(d, TODAY)).toEqual({ total: REWARDED_GOALS + 2, done: REWARDED_GOALS + 2 });
  });

  it('do not earn again by deleting a finished one and adding another', () => {
    let d = start();
    for (let i = 0; i < REWARDED_GOALS; i++) {
      d = add(d, TODAY, `Goal ${i}`, `g${i}`, null, T0 + i);
      d = togglePlanItem(d, `g${i}`, TODAY, T0 + 100 + i);
      d = deletePlanItem(d, `g${i}`, T0 + 200 + i);
    }
    // Removed ones keep what they earned.
    expect(derive(d, TODAY).heroXp).toBe(REWARDED_GOALS * 10);
    d = add(d, TODAY, 'One more', 'extra', null, T0 + 300);
    d = togglePlanItem(d, 'extra', TODAY, T0 + 400);
    expect(derive(d, TODAY).heroXp).toBe(REWARDED_GOALS * 10);
    expect(planFor(d, TODAY).items).toHaveLength(1);
  });

  it('count separately for each day', () => {
    let d = start();
    d = add(d, '2026-11-19', 'Yesterday', 'y');
    d = add(d, TODAY, 'Today', 't');
    d = togglePlanItem(d, 'y', TODAY, T0 + 1);
    d = togglePlanItem(d, 't', TODAY, T0 + 2);
    expect(derive(d, TODAY).heroXp).toBe(20);
  });
});

describe('moving unfinished things', () => {
  it('finds what was left undone in the days before', () => {
    let d = start();
    d = add(d, '2026-11-18', 'Old', 'old');
    d = add(d, '2026-11-19', 'Done yesterday', 'done');
    d = togglePlanItem(d, 'done', TODAY, T0 + 1);
    d = add(d, TODAY, 'Still open today', 'open');
    d = add(d, '2026-11-01', 'Too long ago', 'ancient');
    expect(unfinishedBefore(d, TOMORROW).map((p) => p.id)).toEqual(['old', 'open']);
    expect(unfinishedBefore(d, TODAY).map((p) => p.id)).toEqual(['old']);
  });

  it('moves a goal to another day', () => {
    let d = add(start(), TODAY, 'Call', 'a', '10:00');
    d = movePlanItem(d, 'a', TOMORROW, T0 + 10);
    expect(planFor(d, TODAY).items).toHaveLength(0);
    expect(planFor(d, TOMORROW).items[0]).toMatchObject({ id: 'a', title: 'Call', time: '10:00' });
  });

  it('moves a main goal into the main place of a day that has none', () => {
    let d = setMainGoal(start(), TODAY, 'Big thing', TODAY, T0);
    d = movePlanItem(d, mainId(TODAY), TOMORROW, T0 + 10, 'unused');
    expect(planFor(d, TODAY).main).toBeNull();
    expect(planFor(d, TOMORROW).main).toMatchObject({ id: mainId(TOMORROW), title: 'Big thing', done: false });
  });

  it('adds a moved main goal as another goal when the day already has one', () => {
    let d = setMainGoal(start(), TODAY, 'Big thing', TODAY, T0);
    d = setMainGoal(d, TOMORROW, 'Tomorrow’s thing', TODAY, T0);
    d = movePlanItem(d, mainId(TODAY), TOMORROW, T0 + 10, 'moved');
    expect(planFor(d, TOMORROW).main?.title).toBe('Tomorrow’s thing');
    expect(planFor(d, TOMORROW).items.map((p) => p.title)).toEqual(['Big thing']);
    expect(planFor(d, TODAY).main).toBeNull();
  });

  it('leaves finished things where they are', () => {
    let d = add(start(), TODAY, 'Call', 'a');
    d = togglePlanItem(d, 'a', TODAY, T0 + 1);
    expect(movePlanItem(d, 'a', TOMORROW, T0 + 10)).toBe(d);
  });
});

describe('the day itself', () => {
  it('keeps a wake-up time, a bedtime and a note, changing only what is passed', () => {
    let d = saveDay(start(), TOMORROW, { wake: '06:30' }, T0);
    d = saveDay(d, TOMORROW, { note: '  Pack the gym bag  ' }, T0 + 10);
    d = saveDay(d, TOMORROW, { bed: '22:45' }, T0 + 20);
    expect(planFor(d, TOMORROW).day).toMatchObject({ wake: '06:30', bed: '22:45', note: 'Pack the gym bag' });

    d = saveDay(d, TOMORROW, { wake: null }, T0 + 30);
    expect(planFor(d, TOMORROW).day).toMatchObject({ wake: null, bed: '22:45' });
    expect(saveDay(d, TOMORROW, { bed: '22:45' }, T0 + 40)).toBe(d);
  });

  it('does not create an empty record', () => {
    const d = start();
    expect(saveDay(d, TOMORROW, { note: '  ' }, T0)).toBe(d);
    expect(hasPlan(d, TOMORROW)).toBe(false);
    expect(hasPlan(saveDay(d, TOMORROW, { wake: '07:00' }, T0), TOMORROW)).toBe(true);
    expect(hasPlan(add(d, TOMORROW, 'Call', 'a'), TOMORROW)).toBe(true);
  });

  it('lists the money that moves on a date', () => {
    let d = money.setupMoney(start(), 100_000, null, 'BRL', TODAY, T0);
    d = money.saveRecurring(
      d,
      { name: 'Rent', kind: 'expense', amount: 150_000, category: 'housing', day: 21, startMonth: '2026-11', endMonth: null, goalId: null, debtId: null },
      undefined,
      T0,
    );
    d = money.saveRecurring(
      d,
      { name: 'Salary', kind: 'income', amount: 500_000, category: 'salary', day: 5, startMonth: '2026-11', endMonth: null, goalId: null, debtId: null },
      undefined,
      T0,
    );
    d = money.saveSubscription(
      d,
      { name: 'Music', amount: 2_190, cycle: 'monthly', anchor: '2026-10-21', paidWith: 'card', active: true, note: '' },
      undefined,
      TODAY,
      T0,
    );
    d = money.saveSubscription(
      d,
      { name: 'Cancelled', amount: 9_990, cycle: 'monthly', anchor: '2026-10-21', paidWith: 'bank', active: false, note: '' },
      undefined,
      TODAY,
      T0,
    );
    expect(moneyDue(d, TOMORROW).map((m) => [m.name, m.kind, m.onCard])).toEqual([
      ['Rent', 'expense', false],
      ['Music', 'expense', true],
    ]);
    expect(moneyDue(d, TODAY)).toEqual([]);
    expect(moneyDue(d, '2026-12-05').map((m) => m.name)).toEqual(['Salary']);
  });
});

describe('saving and merging plans', () => {
  it('survives a round trip through the save file', () => {
    let d = setMainGoal(start(), TOMORROW, 'Finish the report', TODAY, T0);
    d = add(d, TOMORROW, 'Call', 'a', '10:00');
    d = saveDay(d, TOMORROW, { wake: '06:30', note: 'Pack the gym bag' }, T0);
    expect(sameSave(parseSave(serializeSave(d)), d)).toBe(true);
  });

  it('opens a save from before plans existed', () => {
    const old = JSON.parse(serializeSave(start()));
    delete old.plan;
    delete old.days;
    delete old.habitDays;
    old.version = 5;
    const d = parseSave(JSON.stringify(old));
    expect(d.version).toBe(10);
    expect(d.habitDays).toEqual({});
    expect(d.plan).toEqual({});
    expect(d.days).toEqual({});
  });

  it('keeps one main goal when two devices set it for the same day', () => {
    const base = start();
    const pc = setMainGoal(base, TOMORROW, 'From the PC', TODAY, T0 + 100);
    const tablet = setMainGoal(base, TOMORROW, 'From the tablet', TODAY, T0 + 200);
    const merged = mergeSaves(pc, tablet);
    expect(sameSave(merged, mergeSaves(tablet, pc))).toBe(true);
    expect(planFor(merged, TOMORROW).main?.title).toBe('From the tablet');
    // The planning reward is not given twice either.
    expect(derive(merged, TODAY).heroXp).toBe(PLAN_AHEAD_REWARD.xp);
  });

  it('keeps goals added on both devices', () => {
    const base = start();
    const merged = mergeSaves(add(base, TOMORROW, 'One', 'a'), add(base, TOMORROW, 'Two', 'b', null, T0 + 1));
    expect(planFor(merged, TOMORROW).items.map((p) => p.title)).toEqual(['One', 'Two']);
  });
});

describe('choosing habits for a day', () => {
  // TODAY is a Friday. One habit for every day, one for Mondays only, one three times a week.
  const MON = '2026-11-23';
  const withHabits = (): { d: SaveData; daily: string; monday: string; weekly: string } => {
    let d = start();
    const habit = (name: string, schedule: actions.HabitInput['schedule']) =>
      actions.saveHabit(d, { name, category: 'exercise', stat: 'str', difficulty: 'easy', schedule, target: 1 }, undefined, '2026-11-01', T0);
    d = habit('Daily', { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] });
    d = habit('Mondays', { kind: 'weekdays', days: [1] });
    d = habit('Weekly', { kind: 'perWeek', times: 3 });
    const id = (name: string) => Object.values(d.habits).find((h) => h.name === name)!.id;
    return { d, daily: id('Daily'), monday: id('Mondays'), weekly: id('Weekly') };
  };
  const names = (d: SaveData, date: string) => dueHabits(d, date).map((h) => h.name).sort();
  const complete = (d: SaveData, id: string, date: string) => actions.setHabitCount(d, id, date, 1, T0);

  it('picks a habit as a priority without changing what is due', () => {
    const { d, daily, weekly } = withHabits();
    let next = setHabitChoice(d, daily, TOMORROW, 'pick', TODAY, T0);
    next = setHabitChoice(next, weekly, TOMORROW, 'pick', TODAY, T0);
    expect([...habitChoices(next, TOMORROW)]).toEqual(expect.arrayContaining([[daily, 'pick'], [weekly, 'pick']]));
    expect(names(next, TOMORROW)).toEqual(names(d, TOMORROW));
    expect(hasPlan(next, TOMORROW)).toBe(true);

    next = setHabitChoice(next, daily, TOMORROW, null, TODAY, T0 + 10);
    expect(habitChoices(next, TOMORROW).has(daily)).toBe(false);
    expect(setHabitChoice(next, daily, TOMORROW, null, TODAY, T0 + 20)).toBe(next);
  });

  it('takes a skipped habit off the day', () => {
    const { d, daily } = withHabits();
    const next = setHabitChoice(d, daily, TOMORROW, 'skip', TODAY, T0);
    expect(names(next, TOMORROW)).toEqual(['Weekly']);
    expect(names(next, TODAY)).toEqual(['Daily', 'Weekly']);
    expect(isDueOn(next.habits[daily], TOMORROW, next)).toBe(false);
  });

  it('keeps the streak through a skipped day, and breaks it on a plain miss', () => {
    const { d, daily } = withHabits();
    let done = complete(d, daily, '2026-11-18');
    done = complete(done, daily, '2026-11-19');
    done = complete(done, daily, TODAY);
    const after = (x: SaveData) => walkStreaks(complete(x, daily, '2026-11-22'), '2026-11-22').streaks[daily].current;

    // Saturday missed: the streak starts again on Sunday.
    expect(after(done)).toBe(1);
    // Saturday skipped while planning: Sunday carries on from Friday.
    expect(after(setHabitChoice(done, daily, TOMORROW, 'skip', TODAY, T0))).toBe(4);
  });

  it('counts a skipped habit that was done anyway', () => {
    const { d, daily } = withHabits();
    let next = setHabitChoice(d, daily, TODAY, 'skip', TODAY, T0);
    next = complete(next, daily, TODAY);
    expect(names(next, TODAY)).toContain('Daily');
    expect(walkStreaks(next, TODAY).streaks[daily].current).toBe(1);
  });

  it('adds a habit for just one day', () => {
    const { d, monday } = withHabits();
    expect(names(d, TOMORROW)).not.toContain('Mondays');
    const next = setHabitChoice(d, monday, TOMORROW, 'extra', TODAY, T0);
    expect(names(next, TOMORROW)).toContain('Mondays');
    expect(names(next, '2026-11-22')).not.toContain('Mondays');
  });

  it('adds to the streak for an extra day that was done, and costs nothing if it was not', () => {
    const { d, monday } = withHabits();
    let base = complete(d, monday, '2026-11-16');
    base = setHabitChoice(base, monday, TOMORROW, 'extra', TODAY, T0);
    const streak = (x: SaveData) => walkStreaks(complete(x, monday, MON), MON).streaks[monday].current;
    expect(streak(base)).toBe(2);
    expect(streak(complete(base, monday, TOMORROW))).toBe(3);
  });

  it('does not count a skipped habit against a flawless day', () => {
    const { d, daily, monday } = withHabits();
    let next = setHabitChoice(d, monday, MON, 'skip', TODAY, T0);
    next = complete(next, daily, MON);
    expect(walkStreaks(next, '2026-11-24').perfectDays).toBe(1);
    expect(walkStreaks(complete(d, daily, MON), '2026-11-24').perfectDays).toBe(0);
  });

  it('cannot change a day that has passed', () => {
    const { d, daily } = withHabits();
    expect(setHabitChoice(d, daily, '2026-11-19', 'skip', TODAY, T0)).toBe(d);
  });

  it('merges choices made on two devices', () => {
    const { d, daily, weekly } = withHabits();
    const pc = setHabitChoice(d, daily, TOMORROW, 'skip', TODAY, T0 + 100);
    const tablet = setHabitChoice(setHabitChoice(d, daily, TOMORROW, 'pick', TODAY, T0 + 200), weekly, TOMORROW, 'pick', TODAY, T0 + 200);
    const merged = mergeSaves(pc, tablet);
    expect(sameSave(merged, mergeSaves(tablet, pc))).toBe(true);
    expect(habitChoices(merged, TOMORROW).get(daily)).toBe('pick');
    expect(habitChoices(merged, TOMORROW).get(weekly)).toBe('pick');
  });
});

describe('planning quests from the quest log', () => {
  const withQuest = () => {
    const d = actions.addQuest(start(), 'Book the dentist', 'foc', 'easy', T0);
    return { d, id: Object.keys(d.quests)[0] };
  };

  it('puts a quest on a day and takes it off again', () => {
    const { d, id } = withQuest();
    let next = planQuest(d, id, TOMORROW, T0 + 10);
    expect(planFor(next, TOMORROW).quests.map((q) => q.title)).toEqual(['Book the dentist']);
    expect(planProgress(next, TOMORROW)).toEqual({ total: 1, done: 0 });
    expect(planQuest(next, id, TOMORROW, T0 + 20)).toBe(next);

    next = planQuest(next, id, '2026-11-22', T0 + 30);
    expect(planFor(next, TOMORROW).quests).toHaveLength(0);
    expect(planFor(next, '2026-11-22').quests).toHaveLength(1);

    next = planQuest(next, id, null, T0 + 40);
    expect(planFor(next, '2026-11-22').quests).toHaveLength(0);
  });

  it('shows it as done on its day once it is finished there', () => {
    const { d, id } = withQuest();
    let next = planQuest(d, id, TODAY, T0 + 10);
    next = actions.toggleQuest(next, id, TODAY, T0 + 20);
    expect(planProgress(next, TODAY)).toEqual({ total: 1, done: 1 });
    // A finished quest can no longer be moved.
    expect(planQuest(next, id, TOMORROW, T0 + 30)).toBe(next);
  });

  it('leaves the day if it was finished on another one', () => {
    const { d, id } = withQuest();
    let next = planQuest(d, id, TOMORROW, T0 + 10);
    next = actions.toggleQuest(next, id, TODAY, T0 + 20);
    expect(planFor(next, TOMORROW).quests).toHaveLength(0);
  });
});
