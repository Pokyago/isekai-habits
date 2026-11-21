import type { DateStr, SaveData } from '../data/types';
import { careDay, companion, companionLine } from './companion';
import { addDays } from './dates';

/**
 * What the evening reminder should say. The desktop window shows the reminder when the
 * app is closed, and it knows nothing about habits, so the app writes this down for it
 * ahead of time: one note for today, and one for each of the next days in case the app
 * isn't opened at all on them.
 */
export interface ReminderNote {
  /** Habits still open on that day. With none left, no reminder is shown. */
  left: number;
  title: string;
  body: string;
}

export interface ReminderBrief {
  days: Record<DateStr, ReminderNote>;
  /** For a day further ahead than the notes reach. */
  away: { title: string; body: string };
}

/** How many days ahead notes are written for. */
export const BRIEF_DAYS = 7;

const habits = (n: number) => (n === 1 ? '1 habit' : `${n} habits`);

export function reminderBrief(data: SaveData, today: DateStr): ReminderBrief {
  if (!data.hero) {
    return { days: {}, away: { title: 'Isekai Habits', body: 'Your adventure is waiting to begin.' } };
  }
  const c = companion(data, today);
  const left = c.today.due - c.today.done;
  const days: Record<DateStr, ReminderNote> = {
    [today]: {
      left,
      title: left > 0 ? `${habits(left)} left today` : c.today.due > 0 ? 'All done today' : 'Nothing to do today',
      body: `“${companionLine(c)}”`,
    },
  };
  // The days after: nothing is done on them yet, so everything scheduled is still open.
  for (let i = 1; i <= BRIEF_DAYS; i++) {
    const date = addDays(today, i);
    const due = careDay(data, date).due;
    days[date] = {
      left: due,
      title: `${habits(due)} waiting today`,
      body: 'You haven’t looked in today. Your heroine is waiting for you.',
    };
  }
  return {
    days,
    away: { title: 'Your heroine misses you', body: 'It has been a while. One habit is enough to start again.' },
  };
}
