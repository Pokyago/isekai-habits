import type { DateStr, Habit, Routine, SaveData } from '../data/types';
import { isDone, isDueOn } from './schedule';

/*
 * A routine is a short list of your own habits done one after another, such as the
 * things you do after waking up. Running it ticks the habits; it earns nothing of its own.
 */

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) => Math.max(now, (prev?.updatedAt ?? 0) + 1);

export function routines(data: SaveData): Routine[] {
  return Object.values(data.routines)
    .filter((r) => !r.deleted)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export interface RoutineInput {
  name: string;
  /** The habits, in the order they are done. */
  habitIds: string[];
}

export function saveRoutine(
  data: SaveData,
  input: RoutineInput,
  id: string | undefined,
  now: number,
  newId: string = crypto.randomUUID(),
): SaveData {
  const name = input.name.trim();
  const habitIds = [...new Set(input.habitIds)].filter((h) => data.habits[h] && !data.habits[h].deleted);
  if (name === '' || habitIds.length === 0) return data;
  const prev = id ? data.routines[id] : undefined;
  const routine: Routine = { id: prev?.id ?? newId, name, habitIds, deleted: false, updatedAt: stamp(prev, now) };
  return { ...data, routines: { ...data.routines, [routine.id]: routine } };
}

export function deleteRoutine(data: SaveData, id: string, now: number): SaveData {
  const prev = data.routines[id];
  if (!prev || prev.deleted) return data;
  return { ...data, routines: { ...data.routines, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

export interface RoutineStep {
  habit: Habit;
  done: boolean;
}

/** The steps of a routine on a day: its habits that are to be done that day, in order. */
export function routineSteps(data: SaveData, routine: Routine, date: DateStr): RoutineStep[] {
  const steps: RoutineStep[] = [];
  for (const id of routine.habitIds) {
    const habit = data.habits[id];
    if (!habit || habit.deleted || !isDueOn(habit, date, data)) continue;
    steps.push({ habit, done: isDone(data, id, date) });
  }
  return steps;
}
