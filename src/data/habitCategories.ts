import type { StatKey } from './types';

/** A part of life that habits are grouped under. Each one trains a stat by default. */
export interface HabitCategory {
  id: string;
  name: string;
  stat: StatKey;
}

export const HABIT_CATEGORIES: HabitCategory[] = [
  { id: 'sleep', name: 'Sleep', stat: 'vit' },
  { id: 'exercise', name: 'Exercise', stat: 'str' },
  { id: 'nutrition', name: 'Food & drink', stat: 'vit' },
  { id: 'selfcare', name: 'Health & self-care', stat: 'vit' },
  { id: 'hygiene', name: 'Hygiene & grooming', stat: 'vit' },
  { id: 'mind', name: 'Mind & calm', stat: 'spi' },
  { id: 'discipline', name: 'Self-control', stat: 'spi' },
  { id: 'reading', name: 'Reading', stat: 'int' },
  { id: 'study', name: 'Studying & learning', stat: 'int' },
  { id: 'work', name: 'Work', stat: 'foc' },
  { id: 'digital', name: 'Screens & phone', stat: 'foc' },
  { id: 'home', name: 'Home', stat: 'for' },
  { id: 'finance', name: 'Money', stat: 'for' },
  { id: 'social', name: 'People', stat: 'spi' },
  { id: 'hobby', name: 'Hobbies & creativity', stat: 'spi' },
  { id: 'other', name: 'Other', stat: 'foc' },
];

const BY_ID = new Map(HABIT_CATEGORIES.map((c) => [c.id, c]));

export const habitCategory = (id: string): HabitCategory => BY_ID.get(id) ?? BY_ID.get('other')!;

export const categoryIndex = (id: string): number => {
  const i = HABIT_CATEGORIES.findIndex((c) => c.id === id);
  return i === -1 ? HABIT_CATEGORIES.length : i;
};

/** Where a habit with no category goes, judged by the stat it trains. */
export const CATEGORY_FOR_STAT: Record<StatKey, string> = {
  str: 'exercise',
  vit: 'selfcare',
  int: 'study',
  spi: 'mind',
  foc: 'work',
  for: 'home',
};
