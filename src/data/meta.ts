import type { Difficulty, HeroClass, StatKey } from './types';

export const STAT_ORDER: StatKey[] = ['str', 'vit', 'int', 'spi', 'foc', 'for'];

export const STATS: Record<StatKey, { name: string; short: string; blurb: string }> = {
  str: { name: 'Strength', short: 'STR', blurb: 'Exercise and movement' },
  vit: { name: 'Vitality', short: 'VIT', blurb: 'Sleep, food and health' },
  int: { name: 'Intellect', short: 'INT', blurb: 'Reading and learning' },
  spi: { name: 'Spirit', short: 'SPI', blurb: 'Calm, reflection and people' },
  foc: { name: 'Focus', short: 'FOC', blurb: 'Work and productivity' },
  for: { name: 'Fortune', short: 'FOR', blurb: 'Home and finances' },
};

export const statColor = (stat: StatKey) => `var(--stat-${stat})`;

export const DIFFICULTY_ORDER: Difficulty[] = ['trivial', 'easy', 'medium', 'hard'];

export const DIFFICULTIES: Record<Difficulty, { name: string }> = {
  trivial: { name: 'Trivial' },
  easy: { name: 'Easy' },
  medium: { name: 'Medium' },
  hard: { name: 'Hard' },
};

export const CLASS_ORDER: HeroClass[] = ['warrior', 'paladin', 'mage', 'monk', 'ranger', 'merchant'];

export const CLASSES: Record<HeroClass, { name: string; stat: StatKey; blurb: string }> = {
  warrior: { name: 'Warrior', stat: 'str', blurb: 'Grows fastest through training the body.' },
  paladin: { name: 'Paladin', stat: 'vit', blurb: 'Draws power from rest and good health.' },
  mage: { name: 'Mage', stat: 'int', blurb: 'Every page read sharpens the mind.' },
  monk: { name: 'Monk', stat: 'spi', blurb: 'Finds strength in stillness and reflection.' },
  ranger: { name: 'Ranger', stat: 'foc', blurb: 'Unshakeable attention on the task at hand.' },
  merchant: { name: 'Merchant', stat: 'for', blurb: 'An orderly home and a full purse.' },
};

/** Extra XP on habits and quests that match the hero's class stat. */
export const CLASS_BONUS = 0.1;

export const SHIELD_COST = 150;

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Weekday numbers in display order, Monday first. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
