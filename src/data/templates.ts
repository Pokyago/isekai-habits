import type { Difficulty, Schedule, StatKey } from './types';

export interface HabitTemplate {
  key: string;
  name: string;
  stat: StatKey;
  difficulty: Difficulty;
  schedule: Schedule;
  target: number;
}

const DAILY: Schedule = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };
const WORKDAYS: Schedule = { kind: 'weekdays', days: [1, 2, 3, 4, 5] };
const perWeek = (times: number): Schedule => ({ kind: 'perWeek', times });

const t = (
  key: string,
  name: string,
  stat: StatKey,
  difficulty: Difficulty,
  schedule: Schedule = DAILY,
  target = 1,
): HabitTemplate => ({ key, name, stat, difficulty, schedule, target });

export const TEMPLATE_GROUPS: { area: string; templates: HabitTemplate[] }[] = [
  {
    area: 'Health & fitness',
    templates: [
      t('workout', 'Workout', 'str', 'hard', perWeek(3)),
      t('walk', 'Walk 8,000 steps', 'str', 'easy'),
      t('stretch', 'Stretch for 10 minutes', 'str', 'trivial'),
      t('water', 'Drink 8 glasses of water', 'vit', 'easy', DAILY, 8),
      t('sleep', 'In bed by 11pm', 'vit', 'medium'),
      t('eat', 'Eat a healthy meal', 'vit', 'easy'),
    ],
  },
  {
    area: 'Mind & learning',
    templates: [
      t('read', 'Read for 20 minutes', 'int', 'easy'),
      t('study', 'Study or practise a skill for 30 minutes', 'int', 'medium'),
      t('language', 'Language practice', 'int', 'easy'),
      t('meditate', 'Meditate for 10 minutes', 'spi', 'easy'),
      t('journal', 'Write in a journal', 'spi', 'easy'),
    ],
  },
  {
    area: 'Work & productivity',
    templates: [
      t('deepwork', 'Deep work session (90 minutes)', 'foc', 'hard', WORKDAYS),
      t('plan', 'Plan the day', 'foc', 'trivial'),
      t('inbox', 'Clear the inbox', 'foc', 'easy', WORKDAYS),
      t('nophone', 'No phone for the first hour', 'foc', 'medium'),
    ],
  },
  {
    area: 'Home & finances',
    templates: [
      t('bed', 'Make the bed', 'for', 'trivial'),
      t('tidy', 'Tidy up for 10 minutes', 'for', 'easy'),
      t('cook', 'Cook at home', 'for', 'medium'),
      t('spending', 'Track today’s spending', 'for', 'easy'),
      t('budget', 'Weekly budget review', 'for', 'medium', perWeek(1)),
      t('clean', 'Deep clean one room', 'for', 'medium', perWeek(1)),
      t('friend', 'Call a friend or family member', 'spi', 'easy', perWeek(1)),
    ],
  },
];

export const STARTER_REWARDS: { name: string; cost: number }[] = [
  { name: 'Watch an episode', cost: 50 },
  { name: 'A favourite snack', cost: 80 },
  { name: 'One hour of gaming', cost: 100 },
  { name: 'Buy something nice', cost: 500 },
];
