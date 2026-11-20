import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { Habit, SaveData, Schedule } from '../data/types';
import { dailyQuests } from './dailyQuests';
import { addDays, daysBetween, weekStart, weekday } from './dates';
import { derive } from './derive';
import { levelFromXp, rankForLevel, xpToNext } from './levels';
import { walkStreaks } from './streaks';
import { habitReward, streakMultiplier } from './xp';

const DAILY: Schedule = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };
const MON = '2026-11-02'; // a Monday

function withHabit(data: SaveData, patch: Partial<Habit> & { id: string }): SaveData {
  const habit: Habit = {
    name: patch.id,
    stat: 'str',
    difficulty: 'medium',
    schedule: DAILY,
    target: 1,
    startDate: MON,
    archivedOn: null,
    deleted: false,
    updatedAt: 1,
    ...patch,
  };
  return { ...data, habits: { ...data.habits, [habit.id]: habit } };
}

function complete(data: SaveData, habitId: string, dates: string[]): SaveData {
  let d = data;
  let now = 1000;
  for (const date of dates) d = actions.setHabitCount(d, habitId, date, 99, now++);
  return d;
}

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

function withShield(data: SaveData, date: string): SaveData {
  return {
    ...data,
    purchases: {
      ...data.purchases,
      [`s-${date}`]: { id: `s-${date}`, kind: 'shield', name: 'Streak shield', cost: 150, date, updatedAt: 1 },
    },
  };
}

describe('dates', () => {
  it('handles weeks and month boundaries', () => {
    expect(weekday(MON)).toBe(1);
    expect(weekStart('2026-11-08')).toBe(MON); // Sunday belongs to the week that started Monday
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(daysBetween('2026-10-20', '2026-11-02')).toBe(13);
  });
});

describe('levels', () => {
  it('follows the 50 × n^1.5 curve', () => {
    expect(xpToNext(1, 50)).toBe(50);
    expect(xpToNext(4, 50)).toBe(400);
    expect(levelFromXp(0, 50)).toMatchObject({ level: 1, into: 0, needed: 50 });
    expect(levelFromXp(49, 50).level).toBe(1);
    expect(levelFromXp(50, 50)).toMatchObject({ level: 2, into: 0, needed: 141 });
    expect(levelFromXp(50 + 141 + 10, 50)).toMatchObject({ level: 3, into: 10 });
  });

  it('maps levels to guild ranks', () => {
    expect([1, 4, 5, 10, 15, 20, 30, 40, 99].map(rankForLevel)).toEqual(['F', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'S']);
  });
});

describe('xp', () => {
  it('scales with difficulty, streak and class', () => {
    expect(habitReward('trivial', 0, false)).toEqual({ xp: 5, gold: 3 });
    expect(habitReward('hard', 0, false)).toEqual({ xp: 40, gold: 20 });
    expect(streakMultiplier(15)).toBeCloseTo(1.25);
    expect(streakMultiplier(300)).toBeCloseTo(1.5);
    expect(habitReward('medium', 30, false).xp).toBe(30);
    expect(habitReward('medium', 0, true).xp).toBe(22);
  });
});

describe('streaks', () => {
  it('counts consecutive days and does not break on the current day', () => {
    let d = withHabit(emptySave(), { id: 'a' });
    d = complete(d, 'a', days(MON, 3));
    expect(walkStreaks(d, addDays(MON, 2)).streaks.a).toMatchObject({ current: 3, best: 3 });
    // Day 4 not done yet, but it is "today", so the streak holds.
    expect(walkStreaks(d, addDays(MON, 3)).streaks.a.current).toBe(3);
    // Once day 4 is over, the streak is lost but the best is remembered.
    expect(walkStreaks(d, addDays(MON, 4)).streaks.a).toMatchObject({ current: 0, best: 3 });
  });

  it('skips days the habit is not scheduled', () => {
    let d = withHabit(emptySave(), { id: 'a', schedule: { kind: 'weekdays', days: [1, 3, 5] } });
    d = complete(d, 'a', [MON, addDays(MON, 2), addDays(MON, 4), addDays(MON, 7)]);
    expect(walkStreaks(d, addDays(MON, 8)).streaks.a.current).toBe(4);
  });

  it('spends one shield to cover a missed day across all habits', () => {
    let d = withHabit(withHabit(emptySave(), { id: 'a' }), { id: 'b' });
    d = complete(d, 'a', [MON, addDays(MON, 1), addDays(MON, 3)]);
    d = complete(d, 'b', [MON, addDays(MON, 1), addDays(MON, 3)]);
    d = withShield(d, addDays(MON, 1));
    const w = walkStreaks(d, addDays(MON, 3));
    expect(w.streaks.a.current).toBe(3);
    expect(w.streaks.b.current).toBe(3);
    expect(w.shieldsLeft).toBe(0);
    expect(w.shieldedDays).toEqual([addDays(MON, 2)]);
  });

  it('does not spend a shield when there is no streak to protect', () => {
    let d = withHabit(emptySave(), { id: 'a' });
    d = withShield(d, MON);
    expect(walkStreaks(d, addDays(MON, 5)).shieldsLeft).toBe(1);
  });

  it('tracks times-per-week habits in weeks', () => {
    let d = withHabit(emptySave(), { id: 'gym', schedule: { kind: 'perWeek', times: 2 } });
    d = complete(d, 'gym', [MON, addDays(MON, 3)]); // week 1 met
    d = complete(d, 'gym', [addDays(MON, 8), addDays(MON, 9)]); // week 2 met
    expect(walkStreaks(d, addDays(MON, 10)).streaks.gym).toMatchObject({ current: 2, unit: 'weeks' });
    // Week 3 passes with nothing done: checked the Monday after.
    expect(walkStreaks(d, addDays(MON, 20)).streaks.gym.current).toBe(2);
    expect(walkStreaks(d, addDays(MON, 21)).streaks.gym).toMatchObject({ current: 0, best: 2 });
  });

  it('gives a grace week when a weekly habit starts mid-week', () => {
    const start = addDays(MON, 3);
    let d = withHabit(emptySave(), { id: 'gym', startDate: start, schedule: { kind: 'perWeek', times: 3 } });
    d = complete(d, 'gym', days(addDays(MON, 7), 3)); // meets the first full week
    expect(walkStreaks(d, addDays(MON, 13)).streaks.gym.current).toBe(1);
  });

  it('counts flawless days', () => {
    let d = withHabit(withHabit(emptySave(), { id: 'a' }), { id: 'b' });
    d = complete(d, 'a', days(MON, 2));
    d = complete(d, 'b', [MON]);
    expect(walkStreaks(d, addDays(MON, 1)).perfectDays).toBe(1);
  });
});

describe('completing habits', () => {
  it('fixes XP with the streak bonus at the time of completion', () => {
    let d = withHabit(emptySave(), { id: 'a', difficulty: 'medium' });
    d = complete(d, 'a', days(MON, 30));
    expect(d.completions[`a|${MON}`].xp).toBe(20); // streak of 1 → 20 × (1 + 1/60) rounds to 20
    expect(d.completions[`a|${addDays(MON, 14)}`].xp).toBe(25); // streak 15 → ×1.25
    expect(d.completions[`a|${addDays(MON, 29)}`].xp).toBe(30); // streak 30 → ×1.5
  });

  it('needs the full target for counted habits and takes XP back when undone', () => {
    let d = withHabit(emptySave(), { id: 'water', target: 8, difficulty: 'easy' });
    d = actions.setHabitCount(d, 'water', MON, 7, 10);
    expect(d.completions[`water|${MON}`]).toMatchObject({ count: 7, done: false, xp: 0 });
    d = actions.setHabitCount(d, 'water', MON, 8, 11);
    expect(d.completions[`water|${MON}`]).toMatchObject({ done: true, xp: 10, gold: 5 });
    d = actions.setHabitCount(d, 'water', MON, 7, 12);
    expect(derive(d, MON).heroXp).toBe(0);
  });

  it('applies the class bonus to matching habits only', () => {
    let d = actions.createHero(emptySave(), 'Aria', 'warrior', [], MON, 1);
    d = withHabit(withHabit(d, { id: 's', stat: 'str' }), { id: 'i', stat: 'int' });
    d = actions.setHabitCount(d, 's', MON, 1, 10);
    d = actions.setHabitCount(d, 'i', MON, 1, 11);
    expect(d.completions[`s|${MON}`].xp).toBe(22);
    expect(d.completions[`i|${MON}`].xp).toBe(20);
  });

  it('keeps earned XP when a habit is edited or deleted', () => {
    let d = withHabit(emptySave(), { id: 'a', difficulty: 'hard' });
    d = complete(d, 'a', [MON]);
    const before = derive(d, MON).heroXp;
    d = actions.saveHabit(d, { name: 'a', stat: 'int', difficulty: 'trivial', schedule: DAILY, target: 1 }, 'a', MON, 50);
    d = actions.deleteHabit(d, 'a', 60);
    const after = derive(d, MON);
    expect(after.heroXp).toBe(before);
    expect(after.stats.str.total).toBeGreaterThan(0);
  });
});

describe('daily quests', () => {
  const base = () =>
    withHabit(withHabit(withHabit(emptySave(), { id: 'a', stat: 'str' }), { id: 'b', stat: 'int' }), {
      id: 'c',
      stat: 'foc',
      difficulty: 'hard',
    });

  it('gives the same quests for the same date on any device', () => {
    const one = dailyQuests(base(), MON).map((q) => q.title + q.goal);
    const two = dailyQuests(base(), MON).map((q) => q.title + q.goal);
    expect(one).toEqual(two);
    expect(one.length).toBe(3);
  });

  it('has no quests on a day with nothing due', () => {
    expect(dailyQuests(emptySave(), MON)).toEqual([]);
  });

  it('pays out once when completed and takes it back when undone', () => {
    let d = base();
    for (const id of ['a', 'b', 'c']) d = actions.setHabitCount(d, id, MON, 1, 100);
    const quests = dailyQuests(d, MON);
    expect(quests.every((q) => q.done)).toBe(true);
    const claimed = Object.values(d.claims).filter((c) => c.claimed);
    expect(claimed.length).toBe(3);
    const habitXp = Object.values(d.completions).reduce((n, c) => n + c.xp, 0);
    const questXp = quests.reduce((n, q) => n + q.xp, 0);
    expect(derive(d, MON).heroXp).toBe(habitXp + questXp);

    for (const id of ['a', 'b', 'c']) d = actions.setHabitCount(d, id, MON, 0, 200);
    expect(derive(d, MON).heroXp).toBe(0);
    expect(derive(d, MON).gold).toBe(0);
  });
});

describe('quests and shop', () => {
  it('rewards a one-off quest and lets gold be spent', () => {
    let d = actions.addQuest(emptySave(), 'File taxes', 'for', 'hard', 1);
    const id = Object.keys(d.quests)[0];
    d = actions.toggleQuest(d, id, MON, 2);
    expect(derive(d, MON)).toMatchObject({ heroXp: 40, gold: 20, questsDone: 1 });

    d = actions.saveReward(d, 'Snack', 15, undefined, 3);
    const rewardId = Object.keys(d.rewards)[0];
    expect(actions.buyReward(d, rewardId, 10, MON, 4)).toBeNull();
    d = actions.buyReward(d, rewardId, derive(d, MON).gold, MON, 4)!;
    expect(derive(d, MON).gold).toBe(5);
    expect(actions.buyShield(d, derive(d, MON).gold, MON, 5)).toBeNull();
  });
});

describe('merging saves', () => {
  it('keeps work from both devices and is the same in either direction', () => {
    const shared = withHabit(withHabit(emptySave(), { id: 'a' }), { id: 'b' });
    const pc = actions.setHabitCount(shared, 'a', MON, 1, 100);
    const ipad = actions.setHabitCount(shared, 'b', MON, 1, 120);
    const ab = mergeSaves(pc, ipad);
    const ba = mergeSaves(ipad, pc);
    expect(sameSave(ab, ba)).toBe(true);
    expect(Object.values(ab.completions).filter((c) => c.done).length).toBe(2);
    expect(sameSave(mergeSaves(ab, pc), ab)).toBe(true); // merging again changes nothing
  });

  it('lets the newest edit win and keeps deletions', () => {
    const shared = withHabit(emptySave(), { id: 'a', name: 'Old' });
    const renamed = actions.saveHabit(shared, { name: 'New', stat: 'str', difficulty: 'easy', schedule: DAILY, target: 1 }, 'a', MON, 500);
    const deleted = actions.deleteHabit(shared, 'a', 900);
    expect(mergeSaves(renamed, shared).habits.a.name).toBe('New');
    expect(mergeSaves(renamed, deleted).habits.a.deleted).toBe(true);
    expect(mergeSaves(deleted, renamed).habits.a.deleted).toBe(true);
  });

  it('does not double-count the same day completed on both devices', () => {
    const shared = withHabit(emptySave(), { id: 'a' });
    const pc = actions.setHabitCount(shared, 'a', MON, 1, 100);
    const ipad = actions.setHabitCount(shared, 'a', MON, 1, 150);
    const merged = mergeSaves(pc, ipad);
    expect(derive(merged, MON).completions).toBe(1);
    expect(Object.values(merged.claims).filter((c) => c.claimed).length).toBe(
      Object.values(pc.claims).filter((c) => c.claimed).length,
    );
  });

  it('round-trips through the save file format and rejects other files', () => {
    const d = complete(withHabit(emptySave(), { id: 'a' }), 'a', [MON]);
    expect(sameSave(parseSave(serializeSave(d)), d)).toBe(true);
    expect(parseSave('')).toEqual(emptySave());
    expect(() => parseSave('{"hello":1}')).toThrow();
    expect(() => parseSave('not json')).toThrow();
  });
});
