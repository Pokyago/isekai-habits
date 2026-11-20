import { CATEGORY_FOR_STAT, HABIT_CATEGORIES, habitCategory, type HabitCategory } from './habitCategories';
import type { Difficulty, Habit, Schedule, StatKey } from './types';

/*
 * The habit library: ready-made habits to pick from, grouped by category.
 * It is deliberately long. Nobody should take on more than a handful at once;
 * the point is that whatever you want to work on is probably already here.
 */

export interface HabitTemplate {
  key: string;
  name: string;
  category: string;
  stat: StatKey;
  difficulty: Difficulty;
  schedule: Schedule;
  target: number;
}

const DAILY: Schedule = { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] };
const WORKDAYS: Schedule = { kind: 'weekdays', days: [1, 2, 3, 4, 5] };
const WEEKENDS: Schedule = { kind: 'weekdays', days: [0, 6] };
const x = (times: number): Schedule => ({ kind: 'perWeek', times });

const T: Difficulty = 'trivial';
const E: Difficulty = 'easy';
const M: Difficulty = 'medium';
const H: Difficulty = 'hard';

/** name, difficulty, then optionally: schedule (every day if left out), times per day, a stat other than the category's. */
type Row = [name: string, difficulty: Difficulty, schedule?: Schedule, target?: number, stat?: StatKey];

const LIBRARY: Record<string, Row[]> = {
  sleep: [
    ['In bed by 11pm', M],
    ['Wake up at the same time', M],
    ['Sleep at least 7 hours', M],
    ['No screens 30 minutes before bed', M],
    ['No phone in bed', M],
    ['No caffeine after 2pm', E],
    ['Wind-down routine before bed', E],
    ['Get up without hitting snooze', E],
    ['Get morning sunlight for 10 minutes', E],
    ['No naps after 4pm', T],
    ['No heavy meal 2 hours before bed', E],
    ['Keep the bedroom dark and cool', T],
    ['Same bedtime on weekends', M, WEEKENDS],
  ],
  exercise: [
    ['Workout', H, x(3)],
    ['Strength training', H, x(3)],
    ['Cardio session', H, x(2)],
    ['Go for a run', H, x(3)],
    ['Walk 8,000 steps', E],
    ['Walk for 30 minutes', E],
    ['Stretch for 10 minutes', T],
    ['Mobility routine', E],
    ['Yoga', M, x(2)],
    ['Do 20 push-ups', E],
    ['Hold a plank for 1 minute', E],
    ['Take the stairs', T],
    ['Bike ride', M, x(2)],
    ['Swim', H, x(1)],
    ['Play a sport', M, x(1)],
    ['Stand up and move every hour', E, WORKDAYS],
    ['Go for a hike or long walk', M, x(1)],
    ['Warm up before training', T, x(3)],
  ],
  nutrition: [
    ['Drink 8 glasses of water', E, DAILY, 8],
    ['Eat a healthy breakfast', E],
    ['Eat vegetables with a meal', E],
    ['Eat a piece of fruit', T],
    ['Eat enough protein', M],
    ['No sugary drinks', M],
    ['No junk food', M],
    ['No snacking after dinner', M],
    ['Cook at home', M],
    ['Meal prep for the week', M, x(1)],
    ['Eat slowly, without a screen', E],
    ['No alcohol', M],
    ['No more than 2 coffees', E],
    ['Take my vitamins', T],
    ['Write down what I eat', E],
    ['No food delivery', M],
    ['Bring lunch from home', M, WORKDAYS],
    ['Stop eating when full', E],
  ],
  selfcare: [
    ['Brush teeth twice', T, DAILY, 2],
    ['Floss', T],
    ['Skincare routine', T],
    ['Take my medication', T],
    ['Put on sunscreen', T],
    ['Cold shower', M],
    ['Check my posture', T],
    ['Rest my eyes every 20 minutes', E, WORKDAYS],
    ['Weekly health check-in', E, x(1)],
    ['Weigh in', T, x(1)],
    ['No smoking', H],
    ['Get some fresh air', T],
    ['Grooming: nails, hair, beard', T, x(1)],
    ['Do my physio or rehab exercises', E],
    ['Book or keep a health appointment', E, x(1)],
  ],
  mind: [
    ['Meditate for 10 minutes', E],
    ['Write in a journal', E],
    ['Write 3 things I am grateful for', T],
    ['Breathing exercise', T],
    ['Morning pages', M],
    ['Evening reflection', E],
    ['Mood check-in', T],
    ['Spend time in nature', E, x(2)],
    ['Pray or spiritual practice', E],
    ['A day without complaining', M],
    ['Sit in silence for 5 minutes', T],
    ['Say no to one thing I do not need', E, x(1)],
    ['Therapy homework', E, x(1)],
    ['Do one thing just for me', E],
  ],
  reading: [
    ['Read for 20 minutes', E],
    ['Read 10 pages', E],
    ['Read before bed', E],
    ['Read a chapter of a book', M],
    ['Read manga or a light novel', T],
    ['Read an article in my field', E],
    ['Read in another language', M],
    ['Listen to an audiobook or podcast', E],
    ['Take notes on what I read', E],
    ['Read the news for 10 minutes only', T],
    ['Read instead of scrolling', M],
    ['Visit a library or bookshop', E, x(1)],
  ],
  study: [
    ['Study for 30 minutes', M],
    ['Study for 1 hour', H],
    ['Language practice', E],
    ['Review flashcards', E],
    ['Practise a skill for 30 minutes', M],
    ['Do a lesson of an online course', M],
    ['Watch an educational video', E],
    ['Solve a coding problem', M],
    ['Practise an instrument', M],
    ['Write a summary of what I learned', E],
    ['Learn 5 new words', T],
    ['Review the week’s notes', E, x(1)],
    ['Work on a side project', H, x(2)],
    ['Explain something I learned to someone', M, x(1)],
    ['Study without my phone nearby', M],
  ],
  work: [
    ['Deep work session (90 minutes)', H, WORKDAYS],
    ['Plan the day', T, WORKDAYS],
    ['Pick the 3 most important tasks', T, WORKDAYS],
    ['Do the hardest task first', M, WORKDAYS],
    ['4 focused 25-minute blocks', M, WORKDAYS, 4],
    ['Clear the inbox', E, WORKDAYS],
    ['Start work on time', E, WORKDAYS],
    ['Stop work on time', E, WORKDAYS],
    ['End-of-day shutdown review', E, WORKDAYS],
    ['Take a proper lunch break', T, WORKDAYS],
    ['Update my task list', T, WORKDAYS],
    ['Reply to pending messages', E, WORKDAYS],
    ['Tidy my desk', T, WORKDAYS],
    ['No social media during work hours', M, WORKDAYS],
    ['Plan the week', E, x(1)],
    ['Weekly review', M, x(1)],
    ['Learn something for my career', M, x(2)],
    ['Ask for or give feedback', M, x(1)],
  ],
  digital: [
    ['No phone for the first hour', M],
    ['No social media before noon', M],
    ['Screen time under 2 hours', H],
    ['Phone out of reach while working', E, WORKDAYS],
    ['No phone at meals', E],
    ['Check messages only at set times', M],
    ['No scrolling in bed', M],
    ['One screen-free hour', E],
    ['Only one episode', M],
    ['Games only after the day’s habits', M],
    ['Delete or unsubscribe from one thing', T, x(1)],
    ['Back up my files', T, x(1)],
    ['Half a day offline', H, x(1)],
  ],
  home: [
    ['Make the bed', T],
    ['Tidy up for 10 minutes', E],
    ['Wash the dishes', E],
    ['Wipe the kitchen surfaces', T],
    ['Take out the rubbish', T, x(2)],
    ['Do the laundry', M, x(1)],
    ['Deep clean one room', M, x(1)],
    ['Clean the bathroom', M, x(1)],
    ['Vacuum or sweep', E, x(2)],
    ['Change the bed sheets', E, x(1)],
    ['Water the plants', T, x(2)],
    ['Grocery shopping with a list', E, x(1)],
    ['Declutter one thing', T],
    ['Care for my pet', T],
    ['Set out tomorrow’s clothes and bag', T],
    ['Fix or sort out one small thing', E, x(1)],
  ],
  finance: [
    ['Record today’s spending', E],
    ['Weekly budget review', M, x(1)],
    ['Check my bank balance', T, x(1)],
    ['Import my bank statement', E, x(1)],
    ['No impulse purchases', M],
    ['No-spend day', M, x(2)],
    ['Wait 24 hours before buying something', E],
    ['Put money into savings', M, x(1)],
    ['Pay extra towards a debt', H, x(1)],
    ['Pay a bill before it is due', E, x(1)],
    ['Review my subscriptions', E, x(1)],
    ['Sell or donate something unused', E, x(1)],
    ['Compare prices before buying', T],
  ],
  social: [
    ['Call a friend or family member', E, x(1)],
    ['Message someone I care about', T],
    ['Quality time with my partner', E],
    ['Dinner together without screens', E],
    ['Meet a friend in person', M, x(1)],
    ['Do something kind for someone', E],
    ['Give a sincere compliment', T],
    ['Say thank you to someone', T],
    ['Listen without interrupting', E],
    ['Date night', M, x(1)],
    ['Reply to messages I have been putting off', E],
    ['Join a group or community activity', M, x(1)],
    ['Check in on a relative', E, x(1)],
  ],
  hobby: [
    ['Work on a hobby for 30 minutes', E],
    ['Work on a creative project', H, x(2)],
    ['Draw or sketch', E],
    ['Write 200 words', M],
    ['Play music for fun', E],
    ['Take a photo worth keeping', T],
    ['Build or make something', M, x(2)],
    ['Cook a new recipe', M, x(1)],
    ['Gardening', E, x(1)],
    ['Practise a craft', E],
    ['Learn a new song or technique', M, x(1)],
    ['Listen to an album start to finish', T, x(1)],
    ['Play a game just for fun', T, x(2)],
  ],
};

export const TEMPLATE_GROUPS: { category: HabitCategory; templates: HabitTemplate[] }[] = HABIT_CATEGORIES.filter(
  (c) => LIBRARY[c.id],
).map((category) => ({
  category,
  templates: LIBRARY[category.id].map(([name, difficulty, schedule = DAILY, target = 1, stat = category.stat]) => ({
    key: `${category.id}/${name}`,
    name,
    category: category.id,
    stat,
    difficulty,
    schedule,
    target,
  })),
}));

export const ALL_TEMPLATES: HabitTemplate[] = TEMPLATE_GROUPS.flatMap((g) => g.templates);

/** A gentle starting set, ticked by default when the hero is created. */
export const SUGGESTED_TEMPLATES = [
  'exercise/Walk 8,000 steps',
  'reading/Read for 20 minutes',
  'work/Plan the day',
  'home/Make the bed',
];

const CATEGORY_BY_NAME = new Map(ALL_TEMPLATES.map((t) => [t.name.toLowerCase(), t.category]));
// Names used by the first version of the library, for habits created back then.
for (const [name, category] of [
  ['drink 8 glasses of water', 'nutrition'],
  ['eat a healthy meal', 'nutrition'],
  ['study or practise a skill for 30 minutes', 'study'],
  ['clear the inbox', 'work'],
  ['track today’s spending', 'finance'],
] as const) {
  if (!CATEGORY_BY_NAME.has(name)) CATEGORY_BY_NAME.set(name, category);
}

/**
 * The category a habit belongs to. Habits made before categories existed have
 * none saved: those are matched to the library by name, or else placed by their stat.
 */
export function categoryOf(habit: Pick<Habit, 'category' | 'name' | 'stat'>): string {
  if (habit.category) return habitCategory(habit.category).id;
  return CATEGORY_BY_NAME.get(habit.name.toLowerCase()) ?? CATEGORY_FOR_STAT[habit.stat];
}

export const STARTER_REWARDS: { name: string; cost: number }[] = [
  { name: 'Watch an episode', cost: 50 },
  { name: 'A favourite snack', cost: 80 },
  { name: 'One hour of gaming', cost: 100 },
  { name: 'Buy something nice', cost: 500 },
];
