import type { DateStr, SaveData } from '../data/types';
import { addDays, toDateStr } from './dates';
import { dueHabits, isDone } from './schedule';

/**
 * The heroine who stands at the side of every screen. How she feels is worked out
 * from the habits of the last days, never stored: looking after the habits is
 * looking after her.
 */
export type Mood = 'radiant' | 'cheerful' | 'steady' | 'tired' | 'exhausted';

/** Best first. `from` is the lowest morale (0–100) that still gives the mood. */
export const MOOD_ORDER: Mood[] = ['radiant', 'cheerful', 'steady', 'tired', 'exhausted'];
export const MOODS: Record<Mood, { name: string; from: number }> = {
  radiant: { name: 'Radiant', from: 85 },
  cheerful: { name: 'Cheerful', from: 65 },
  steady: { name: 'Steady', from: 40 },
  tired: { name: 'Tired', from: 20 },
  exhausted: { name: 'Exhausted', from: 0 },
};

/** How many days before today she remembers. */
export const CARE_DAYS = 7;
/** Each day further back counts this much of the day after it, so a missed day costs about one mood. */
const FADE = 0.7;
/** How a day counts from before the hero was summoned: she arrives in good spirits. */
const FRESH = 0.7;

/** The habits of one day: how many there were to do, and how many were done. */
export interface CareDay {
  date: DateStr;
  due: number;
  done: number;
}

export interface Companion {
  /** 0–100. */
  morale: number;
  mood: Mood;
  today: CareDay;
  /** The days before today that she remembers, oldest first. */
  week: CareDay[];
}

/**
 * Habits set for particular weekdays count on their days (unless skipped while planning).
 * A times-a-week habit has no day of its own, so it only counts on the days it was done.
 */
export function careDay(data: SaveData, date: DateStr): CareDay {
  let due = 0;
  let done = 0;
  for (const h of dueHabits(data, date)) {
    const ticked = isDone(data, h.id, date);
    if (h.schedule.kind === 'perWeek' && !ticked) continue;
    due++;
    if (ticked) done++;
  }
  return { date, due, done };
}

export function moodFor(morale: number): Mood {
  return MOOD_ORDER.find((m) => morale >= MOODS[m].from) ?? 'exhausted';
}

/**
 * Morale is the share of habits done over the days before today, the recent days
 * counting most. Days with nothing to do are left out. Today can only lift her:
 * a day isn't held against her until it is over.
 */
export function companion(data: SaveData, today: DateStr): Companion {
  const born = data.hero ? toDateStr(new Date(data.hero.createdAt)) : today;
  const week: CareDay[] = [];
  let sum = 0;
  let weight = 0;
  for (let i = 1; i <= CARE_DAYS; i++) {
    const day = careDay(data, addDays(today, -i));
    week.unshift(day);
    const w = FADE ** (i - 1);
    const share = day.due > 0 ? day.done / day.due : null;
    if (day.date < born) {
      sum += FRESH * w;
      weight += w;
    } else if (share !== null) {
      // The day of the summoning is not held against her either.
      sum += (day.date === born ? Math.max(share, FRESH) : share) * w;
      weight += w;
    }
  }
  const past = weight > 0 ? sum / weight : FRESH;
  const now = careDay(data, today);
  const lifted = now.due > 0 ? (past * weight + now.done / now.due) / (weight + 1) : past;
  const morale = Math.round(100 * Math.max(past, lifted));
  return { morale, mood: moodFor(morale), today: now, week };
}

const LINES: Record<Mood, { allDone: string; some: string; none: string; free: string }> = {
  radiant: {
    allDone: 'Everything done! I feel unstoppable.',
    some: '{left} to go. We’ve got this!',
    none: 'I’m full of energy. What’s first?',
    free: 'A free day. We earned it!',
  },
  cheerful: {
    allDone: 'All done today. That felt good!',
    some: 'Nice! {left} more to go.',
    none: 'Ready when you are!',
    free: 'Nothing to do today. Let’s enjoy it.',
  },
  steady: {
    allDone: 'All done today. I’m getting stronger.',
    some: '{left} left. Let’s keep moving.',
    none: 'A good day would do us good.',
    free: 'Nothing to do today. A quiet one.',
  },
  tired: {
    allDone: 'All done… thank you. I feel better.',
    some: 'That helped. {left} more?',
    none: 'I’m running low. A habit or two would help.',
    free: 'A quiet day. I’ll get some rest.',
  },
  exhausted: {
    allDone: 'You came back for me. Thank you.',
    some: 'That one helped… {left} more?',
    none: 'I can barely stand. Just one habit, please.',
    free: 'I’ll try to rest today.',
  },
};

/** What she says: it follows her mood and how today is going. */
export function companionLine(c: Companion): string {
  const lines = LINES[c.mood];
  const left = c.today.due - c.today.done;
  if (c.today.due === 0) return lines.free;
  if (left === 0) return lines.allDone;
  if (c.today.done === 0) return lines.none;
  return lines.some.replace('{left}', String(left));
}
