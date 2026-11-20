import type { DateStr, Habit, SaveData } from '../data/types';
import { addDays, weekStart, weekday } from './dates';
import { isActiveOn } from './schedule';

export interface HabitStreak {
  /** Consecutive scheduled days completed, or consecutive weeks for times-per-week habits. */
  current: number;
  best: number;
  unit: 'days' | 'weeks';
}

export interface WalkResult {
  streaks: Record<string, HabitStreak>;
  shieldsLeft: number;
  /** Days on which a streak shield absorbed a miss. */
  shieldedDays: DateStr[];
  /** Days on which every scheduled weekday habit was completed. */
  perfectDays: number;
}

interface Running {
  current: number;
  best: number;
  weekCount: number;
  weekMet: boolean;
}

/**
 * Replays history day by day up to `asOf` to work out streaks and shield use.
 *
 * A miss only counts once its day (or week, for times-per-week habits) is over, so
 * `asOf` itself never breaks a streak. When a finished day has misses on habits
 * that have a streak, one shield covers all of them if one is held; otherwise
 * those streaks reset.
 *
 * A day a habit was skipped on while planning is passed over: it neither adds to
 * the streak nor breaks it. A habit added for just one day adds to its streak if
 * done and costs nothing if not.
 */
export function walkStreaks(data: SaveData, asOf: DateStr): WalkResult {
  const habits = Object.values(data.habits)
    .filter((h) => !h.deleted)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const done = new Map<string, Set<DateStr>>();
  for (const c of Object.values(data.completions)) {
    if (!c.done) continue;
    let set = done.get(c.habitId);
    if (!set) done.set(c.habitId, (set = new Set()));
    set.add(c.date);
  }

  const shieldBuys = Object.values(data.purchases)
    .filter((p) => p.kind === 'shield')
    .map((p) => p.date)
    .sort();

  const running = new Map<string, Running>(
    habits.map((h) => [h.id, { current: 0, best: 0, weekCount: 0, weekMet: false }]),
  );

  let shields = 0;
  let buyIdx = 0;
  let perfectDays = 0;
  const shieldedDays: DateStr[] = [];

  if (habits.length > 0) {
    const first = habits.reduce((min, h) => (h.startDate < min ? h.startDate : min), habits[0].startDate);

    for (let day = first; day <= asOf; day = addDays(day, 1)) {
      while (buyIdx < shieldBuys.length && shieldBuys[buyIdx] <= day) {
        shields++;
        buyIdx++;
      }

      const wd = weekday(day);
      const dayOver = day < asOf;
      if (wd === 1) {
        for (const r of running.values()) {
          r.weekCount = 0;
          r.weekMet = false;
        }
      }

      const missed: Running[] = [];
      let due = 0;
      let doneToday = 0;

      for (const h of habits) {
        if (!isActiveOn(h, day)) continue;
        const r = running.get(h.id)!;
        const isDone = done.get(h.id)?.has(day) ?? false;

        if (h.schedule.kind === 'weekdays') {
          const scheduled = h.schedule.days.includes(wd);
          const choice = data.habitDays[`${h.id}|${day}`]?.state;
          if (scheduled ? choice === 'skip' && !isDone : choice !== 'extra') continue;
          due++;
          if (isDone) {
            doneToday++;
            r.current++;
            r.best = Math.max(r.best, r.current);
          } else if (dayOver && scheduled) {
            missed.push(r);
          }
        } else {
          if (isDone) {
            r.weekCount++;
            if (!r.weekMet && r.weekCount >= h.schedule.times) {
              r.weekMet = true;
              r.current++;
              r.best = Math.max(r.best, r.current);
            }
          }
          // Judge the week on its Sunday, but not the partial week the habit started in.
          const fullWeek = weekStart(day) >= h.startDate;
          if (wd === 0 && dayOver && !r.weekMet && fullWeek) missed.push(r);
        }
      }

      if (due > 0 && doneToday === due) perfectDays++;

      const atRisk = missed.filter((r) => r.current > 0);
      if (atRisk.length > 0) {
        if (shields > 0) {
          shields--;
          shieldedDays.push(day);
        } else {
          for (const r of atRisk) r.current = 0;
        }
      }
    }
  }

  while (buyIdx < shieldBuys.length && shieldBuys[buyIdx] <= asOf) {
    shields++;
    buyIdx++;
  }

  const streaks: Record<string, HabitStreak> = {};
  for (const h of habits) {
    const r = running.get(h.id)!;
    streaks[h.id] = { current: r.current, best: r.best, unit: h.schedule.kind === 'perWeek' ? 'weeks' : 'days' };
  }

  return { streaks, shieldsLeft: shields, shieldedDays, perfectDays };
}

/** The streak length used for the XP bonus. A week-long streak counts as seven days. */
export function bonusStreak(habit: Habit, streak: HabitStreak | undefined): number {
  if (!streak) return 0;
  return habit.schedule.kind === 'perWeek' ? streak.current * 7 : streak.current;
}
