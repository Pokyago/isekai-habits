import { CLASSES } from '../data/meta';
import type { DateStr, Meal, MealSlot, SaveData, StatKey } from '../data/types';
import { questReward, type RewardAmount } from '../game/xp';

/*
 * Planning what to eat: one line of text for each meal of a day. A meal can be
 * written down for any day from today on, and ticked as eaten once its day has come.
 */

export const MEAL_SLOTS: { slot: MealSlot; label: string; placeholder: string }[] = [
  { slot: 'breakfast', label: 'Breakfast', placeholder: 'e.g. Eggs, toast and coffee' },
  { slot: 'lunch', label: 'Lunch', placeholder: 'e.g. Rice, beans and grilled chicken' },
  { slot: 'snack', label: 'Snack', placeholder: 'e.g. Fruit and yogurt' },
  { slot: 'dinner', label: 'Dinner', placeholder: 'e.g. Omelette and salad' },
];

/** Shown to pick from until there are enough meals of your own to offer. */
const STARTERS: Record<MealSlot, string[]> = {
  breakfast: ['Eggs and toast', 'Oats with fruit', 'Yogurt and granola', 'Fruit and coffee'],
  lunch: ['Rice, beans and chicken', 'Salad with grilled chicken', 'Pasta with vegetables', 'Fish and vegetables'],
  snack: ['A piece of fruit', 'Yogurt', 'Nuts', 'Protein shake'],
  dinner: ['Omelette and salad', 'Soup', 'Leftovers from lunch', 'Chicken and vegetables'],
};

/** Eating what you planned trains Vitality. */
export const MEAL_STAT: StatKey = 'vit';

/** What a meal eaten as planned is worth (the same as a Trivial quest). */
export const mealReward = (data: SaveData): RewardAmount =>
  questReward('trivial', data.hero ? CLASSES[data.hero.heroClass].stat === MEAL_STAT : false);

export const mealId = (date: DateStr, slot: MealSlot): string => `${date}|${slot}`;

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) =>
  Math.max(now, (prev?.updatedAt ?? 0) + 1);

const put = (data: SaveData, meal: Meal): SaveData => ({ ...data, meals: { ...data.meals, [meal.id]: meal } });

// ---------- reading ----------

/** The meals planned for a day, in the order they are eaten. Meals with nothing written are left out. */
export function mealsFor(data: SaveData, date: DateStr): Meal[] {
  const out: Meal[] = [];
  for (const { slot } of MEAL_SLOTS) {
    const meal = data.meals[mealId(date, slot)];
    if (meal && meal.text !== '') out.push(meal);
  }
  return out;
}

/**
 * Meals to pick from for one meal of the day: the ones you planned for it before,
 * most often first, then a few ready-made ones to fill the list.
 */
export function mealIdeas(data: SaveData, slot: MealSlot, limit = 6): string[] {
  const seen = new Map<string, { text: string; count: number; last: DateStr }>();
  for (const m of Object.values(data.meals)) {
    if (m.slot !== slot || m.text === '') continue;
    const key = m.text.toLowerCase();
    const prev = seen.get(key);
    if (!prev) seen.set(key, { text: m.text, count: 1, last: m.date });
    else {
      prev.count++;
      // Keep the wording used most recently.
      if (m.date > prev.last) {
        prev.last = m.date;
        prev.text = m.text;
      }
    }
  }
  const own = [...seen.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.text.localeCompare(b.text))
    .map((m) => m.text);
  const starters = STARTERS[slot].filter((s) => !seen.has(s.toLowerCase()));
  return [...own, ...starters].slice(0, limit);
}

// ---------- changing ----------

/** Writes down, rewords or (with empty text) clears a meal. Days that have passed can't be changed. */
export function setMeal(data: SaveData, date: DateStr, slot: MealSlot, text: string, today: DateStr, now: number): SaveData {
  if (date < today) return data;
  const id = mealId(date, slot);
  const prev = data.meals[id];
  const clean = text.trim().replace(/\s+/g, ' ');
  if (prev ? prev.text === clean : clean === '') return data;
  // Clearing a meal also unticks it: there is nothing left to have eaten.
  const kept = clean === '' ? { done: false, xp: 0, gold: 0 } : { done: prev?.done ?? false, xp: prev?.xp ?? 0, gold: prev?.gold ?? 0 };
  return put(data, { id, date, slot, text: clean, ...kept, updatedAt: stamp(prev, now) });
}

/** Ticks a meal as eaten as planned, or unticks it. Nothing can be ticked before its day has come. */
export function toggleMeal(data: SaveData, id: string, today: DateStr, now: number): SaveData {
  const prev = data.meals[id];
  if (!prev || prev.text === '' || prev.date > today) return data;
  if (prev.done) return put(data, { ...prev, done: false, xp: 0, gold: 0, updatedAt: stamp(prev, now) });
  return put(data, { ...prev, done: true, ...mealReward(data), updatedAt: stamp(prev, now) });
}

/** Fills the meals of a day that are still empty with those of another day. */
export function copyMeals(data: SaveData, from: DateStr, to: DateStr, today: DateStr, now: number): SaveData {
  let next = data;
  for (const meal of mealsFor(data, from)) {
    const target = data.meals[mealId(to, meal.slot)];
    if (!target || target.text === '') next = setMeal(next, to, meal.slot, meal.text, today, now);
  }
  return next;
}
