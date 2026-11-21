import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { derive } from '../game/derive';
import { copyMeals, mealId, mealIdeas, mealReward, mealsFor, setMeal, toggleMeal } from './meals';
import { hasPlan } from './plan';

const YESTERDAY = '2026-11-19';
const TODAY = '2026-11-20';
const TOMORROW = '2026-11-21';
const T0 = Date.parse('2026-11-20T09:00:00');

/** A save with a hero whose class does not boost Vitality, so rewards are the plain amounts. */
const start = (): SaveData => actions.createHero(emptySave(), 'Tester', 'mage', [], TODAY, T0);

describe('planning meals', () => {
  it('writes a meal down, tidies the text and lists meals in the order they are eaten', () => {
    let d = setMeal(start(), TOMORROW, 'dinner', '  Soup   and bread ', TODAY, T0);
    d = setMeal(d, TOMORROW, 'breakfast', 'Oats', TODAY, T0);
    expect(mealsFor(d, TOMORROW).map((m) => [m.slot, m.text])).toEqual([
      ['breakfast', 'Oats'],
      ['dinner', 'Soup and bread'],
    ]);
    expect(mealsFor(d, TODAY)).toEqual([]);
    expect(hasPlan(d, TOMORROW)).toBe(true);
    expect(hasPlan(d, TODAY)).toBe(false);
  });

  it('changes nothing when the text is the same, or empty with no meal there', () => {
    const d = setMeal(start(), TOMORROW, 'lunch', 'Pasta', TODAY, T0);
    expect(setMeal(d, TOMORROW, 'lunch', ' Pasta ', TODAY, T0 + 1)).toBe(d);
    expect(setMeal(d, TOMORROW, 'dinner', '   ', TODAY, T0 + 1)).toBe(d);
  });

  it('rewords and clears a meal', () => {
    let d = setMeal(start(), TOMORROW, 'lunch', 'Pasta', TODAY, T0);
    d = setMeal(d, TOMORROW, 'lunch', 'Salad', TODAY, T0 + 1);
    expect(mealsFor(d, TOMORROW).map((m) => m.text)).toEqual(['Salad']);
    d = setMeal(d, TOMORROW, 'lunch', '', TODAY, T0 + 2);
    expect(mealsFor(d, TOMORROW)).toEqual([]);
    expect(hasPlan(d, TOMORROW)).toBe(false);
  });

  it('does not change a day that has passed', () => {
    const d = start();
    expect(setMeal(d, YESTERDAY, 'lunch', 'Pasta', TODAY, T0)).toBe(d);
  });
});

describe('eating as planned', () => {
  it('cannot be ticked before the day comes', () => {
    const d = setMeal(start(), TOMORROW, 'lunch', 'Pasta', TODAY, T0);
    expect(toggleMeal(d, mealId(TOMORROW, 'lunch'), TODAY, T0 + 1)).toBe(d);
    expect(toggleMeal(d, mealId(TOMORROW, 'lunch'), TOMORROW, T0 + 1)).not.toBe(d);
  });

  it('earns Vitality XP and gold, and gives them back when unticked', () => {
    let d = setMeal(start(), TODAY, 'lunch', 'Pasta', TODAY, T0);
    const reward = mealReward(d);
    expect(reward).toEqual({ xp: 5, gold: 3 });
    d = toggleMeal(d, mealId(TODAY, 'lunch'), TODAY, T0 + 1);
    let game = derive(d, TODAY);
    expect(game.heroXp).toBe(reward.xp);
    expect(game.stats.vit.total).toBe(reward.xp);
    expect(game.gold).toBe(reward.gold);
    expect(game.mealsKept).toBe(1);

    d = toggleMeal(d, mealId(TODAY, 'lunch'), TODAY, T0 + 2);
    game = derive(d, TODAY);
    expect(game.heroXp).toBe(0);
    expect(game.gold).toBe(0);
    expect(game.mealsKept).toBe(0);
  });

  it('is worth more to a class that trains Vitality', () => {
    const paladin = actions.createHero(emptySave(), 'Tester', 'paladin', [], TODAY, T0);
    expect(mealReward(paladin).xp).toBeGreaterThan(mealReward(start()).xp);
  });

  it('keeps the tick when the meal is reworded, and loses it when the meal is cleared', () => {
    let d = setMeal(start(), TODAY, 'dinner', 'Soup', TODAY, T0);
    d = toggleMeal(d, mealId(TODAY, 'dinner'), TODAY, T0 + 1);
    d = setMeal(d, TODAY, 'dinner', 'Soup and bread', TODAY, T0 + 2);
    expect(mealsFor(d, TODAY)[0].done).toBe(true);
    d = setMeal(d, TODAY, 'dinner', '', TODAY, T0 + 3);
    expect(derive(d, TODAY).heroXp).toBe(0);
    // Written again, it has to be eaten again.
    d = setMeal(d, TODAY, 'dinner', 'Soup', TODAY, T0 + 4);
    expect(mealsFor(d, TODAY)[0].done).toBe(false);
  });

  it('does nothing for a meal that was never written', () => {
    const d = start();
    expect(toggleMeal(d, mealId(TODAY, 'lunch'), TODAY, T0)).toBe(d);
  });
});

describe('meals to pick from', () => {
  it('offers your own meals for that meal of the day first, most often planned first', () => {
    let d = start();
    d = setMeal(d, TODAY, 'lunch', 'Feijoada', TODAY, T0);
    d = setMeal(d, TOMORROW, 'lunch', 'Strogonoff', TODAY, T0);
    d = setMeal(d, '2026-11-22', 'lunch', 'strogonoff', TODAY, T0);
    d = setMeal(d, TODAY, 'dinner', 'Soup of the day', TODAY, T0);
    const ideas = mealIdeas(d, 'lunch');
    // The two spellings are one meal, shown as it was last written.
    expect(ideas.slice(0, 2)).toEqual(['strogonoff', 'Feijoada']);
    expect(ideas).not.toContain('Soup of the day');
    expect(ideas).toHaveLength(6);
  });

  it('offers ready-made meals when nothing has been planned yet, without repeats', () => {
    let d = start();
    const fresh = mealIdeas(d, 'breakfast');
    expect(fresh.length).toBeGreaterThan(0);
    d = setMeal(d, TODAY, 'breakfast', fresh[0].toUpperCase(), TODAY, T0);
    const ideas = mealIdeas(d, 'breakfast').map((i) => i.toLowerCase());
    expect(new Set(ideas).size).toBe(ideas.length);
  });
});

describe('copying a day', () => {
  it('fills only the meals that are still empty', () => {
    let d = start();
    d = setMeal(d, TODAY, 'breakfast', 'Oats', TODAY, T0);
    d = setMeal(d, TODAY, 'lunch', 'Pasta', TODAY, T0);
    d = setMeal(d, TOMORROW, 'lunch', 'Salad', TODAY, T0);
    d = toggleMeal(d, mealId(TODAY, 'breakfast'), TODAY, T0 + 1);
    d = copyMeals(d, TODAY, TOMORROW, TODAY, T0 + 2);
    expect(mealsFor(d, TOMORROW).map((m) => [m.slot, m.text, m.done])).toEqual([
      ['breakfast', 'Oats', false],
      ['lunch', 'Salad', false],
    ]);
  });
});

describe('saving and merging meals', () => {
  it('survives a round trip through the save file', () => {
    let d = setMeal(start(), TODAY, 'lunch', 'Pasta', TODAY, T0);
    d = toggleMeal(d, mealId(TODAY, 'lunch'), TODAY, T0 + 1);
    expect(sameSave(parseSave(serializeSave(d)), d)).toBe(true);
  });

  it('opens a save from before meals existed', () => {
    const old = JSON.parse(serializeSave(start()));
    delete old.meals;
    old.version = 7;
    const d = parseSave(JSON.stringify(old));
    expect(d.version).toBe(12);
    expect(d.meals).toEqual({});
  });

  it('keeps the latest wording when two devices plan the same meal, and both when they plan different ones', () => {
    const base = start();
    const pc = setMeal(setMeal(base, TOMORROW, 'lunch', 'From the PC', TODAY, T0 + 100), TOMORROW, 'dinner', 'Soup', TODAY, T0 + 100);
    const tablet = setMeal(base, TOMORROW, 'lunch', 'From the tablet', TODAY, T0 + 200);
    const merged = mergeSaves(pc, tablet);
    expect(sameSave(merged, mergeSaves(tablet, pc))).toBe(true);
    expect(mealsFor(merged, TOMORROW).map((m) => m.text)).toEqual(['From the tablet', 'Soup']);
  });

  it('does not pay twice for a meal ticked on two devices', () => {
    const base = setMeal(start(), TODAY, 'lunch', 'Pasta', TODAY, T0);
    const pc = toggleMeal(base, mealId(TODAY, 'lunch'), TODAY, T0 + 100);
    const tablet = toggleMeal(base, mealId(TODAY, 'lunch'), TODAY, T0 + 200);
    expect(derive(mergeSaves(pc, tablet), TODAY).heroXp).toBe(mealReward(base).xp);
  });
});
