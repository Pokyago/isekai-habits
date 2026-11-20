import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS } from '../data/meta';
import type { DateStr, Habit, SaveData, Schedule } from '../data/types';
import { addDays, weekStart, weekday } from './dates';

/** The habit exists, isn't deleted, and isn't archived on that date. */
export function isActiveOn(habit: Habit, date: DateStr): boolean {
  return !habit.deleted && habit.startDate <= date && (habit.archivedOn === null || date < habit.archivedOn);
}

/** Weekday habits are due on their days; times-per-week habits can be done on any day. */
export function isDueOn(habit: Habit, date: DateStr): boolean {
  if (!isActiveOn(habit, date)) return false;
  return habit.schedule.kind === 'perWeek' || habit.schedule.days.includes(weekday(date));
}

export function dueHabits(data: SaveData, date: DateStr): Habit[] {
  return Object.values(data.habits)
    .filter((h) => isDueOn(h, date))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function completionId(habitId: string, date: DateStr): string {
  return `${habitId}|${date}`;
}

export function isDone(data: SaveData, habitId: string, date: DateStr): boolean {
  return data.completions[completionId(habitId, date)]?.done ?? false;
}

/** How many days in the date's Monday–Sunday week the habit was completed. */
export function weekCount(data: SaveData, habitId: string, date: DateStr): number {
  const start = weekStart(date);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(data, habitId, addDays(start, i))) n++;
  return n;
}

export function scheduleLabel(schedule: Schedule): string {
  if (schedule.kind === 'perWeek') return schedule.times === 1 ? 'Once a week' : `${schedule.times}× a week`;
  const days = schedule.days;
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEKDAY_DISPLAY_ORDER.filter((d) => set.has(d))
    .map((d) => WEEKDAY_LABELS[d])
    .join(' ');
}
