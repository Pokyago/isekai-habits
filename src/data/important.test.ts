import { describe, expect, it } from 'vitest';
import { derive } from '../game/derive';
import * as actions from './actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from './merge';
import type { SaveData } from './types';

const TODAY = '2026-11-20';
const T0 = Date.parse('2026-11-01T09:00:00');
const input = (over: Partial<actions.HabitInput> = {}): actions.HabitInput => ({
  name: 'Read',
  category: 'reading',
  stat: 'int',
  difficulty: 'easy',
  schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
  target: 1,
  ...over,
});
const start = (): SaveData => actions.saveHabit(actions.createHero(emptySave(), 'Tester', 'mage', [], TODAY, T0), input(), undefined, TODAY, T0);
const only = (d: SaveData) => Object.values(d.habits)[0];

describe('the most important habits', () => {
  it('are marked and unmarked, and nothing else about the habit changes', () => {
    let d = start();
    const id = only(d).id;
    expect(only(d).important).toBeUndefined();

    d = actions.setImportant(d, id, true, T0 + 1);
    expect(only(d)).toMatchObject({ name: 'Read', important: true, stat: 'int' });
    expect(actions.setImportant(d, id, true, T0 + 2)).toBe(d);

    d = actions.setImportant(d, id, false, T0 + 3);
    expect('important' in only(d)).toBe(false);
    expect(actions.setImportant(d, 'no-such-habit', true, T0 + 4)).toBe(d);
  });

  it('are the same habit: ticking it earns once, wherever it is ticked', () => {
    let d = start();
    const id = only(d).id;
    d = actions.setImportant(d, id, true, T0 + 1);
    d = actions.setHabitCount(d, id, TODAY, 1, T0 + 2);
    expect(derive(d, TODAY).completions).toBe(1);
    expect(Object.keys(d.completions)).toHaveLength(1);
  });

  it('can be set in the habit form, and other edits leave the mark alone', () => {
    let d = start();
    const id = only(d).id;
    d = actions.saveHabit(d, input({ important: true }), id, TODAY, T0 + 1);
    expect(only(d).important).toBe(true);
    // Saved without saying either way: the mark stays.
    d = actions.saveHabit(d, input({ name: 'Read 10 pages' }), id, TODAY, T0 + 2);
    expect(only(d)).toMatchObject({ name: 'Read 10 pages', important: true });
    d = actions.saveHabit(d, input({ name: 'Read 10 pages', important: false }), id, TODAY, T0 + 3);
    expect('important' in only(d)).toBe(false);
    // A new habit can start out important.
    d = actions.saveHabit(d, input({ name: 'Run', important: true }), undefined, TODAY, T0 + 4);
    expect(Object.values(d.habits).find((h) => h.name === 'Run')?.important).toBe(true);
  });

  it('survive the save file, and the latest change wins when two devices differ', () => {
    const base = start();
    const id = only(base).id;
    const starred = actions.setImportant(base, id, true, T0 + 100);
    expect(sameSave(parseSave(serializeSave(starred)), starred)).toBe(true);
    expect(only(parseSave(serializeSave(starred))).important).toBe(true);

    const cleared = actions.setImportant(starred, id, false, T0 + 200);
    expect('important' in only(mergeSaves(starred, cleared))).toBe(false);
    expect(only(mergeSaves(cleared, actions.setImportant(cleared, id, true, T0 + 300))).important).toBe(true);
  });
});
