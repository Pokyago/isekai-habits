import { STATS, STAT_ORDER } from '../data/meta';
import type { DateStr, SaveData, StatKey } from '../data/types';
import { dueHabits, isDone } from './schedule';

export interface DailyQuest {
  slot: number;
  title: string;
  detail: string;
  /** Stat that receives the XP, or null for hero XP only. */
  stat: StatKey | null;
  xp: number;
  gold: number;
  progress: number;
  goal: number;
  done: boolean;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(items: T[], rand: () => number): T => items[Math.floor(rand() * items.length)];

/**
 * Up to three bonus quests for a day. They are chosen from the date alone (as a
 * random seed) plus the habits due that day, so every device shows the same ones.
 */
export function dailyQuests(data: SaveData, date: DateStr): DailyQuest[] {
  const due = dueHabits(data, date);
  if (due.length === 0) return [];

  const rand = mulberry32(hashString(date));
  const doneHabits = due.filter((h) => isDone(data, h.id, date));
  const quests: DailyQuest[] = [];

  // Slot 0: complete a number of habits.
  {
    const goal = Math.min(due.length, 2 + Math.floor(rand() * 3));
    const progress = Math.min(doneHabits.length, goal);
    quests.push({
      slot: 0,
      title: 'Daily training',
      detail: `Complete ${goal} ${goal === 1 ? 'habit' : 'habits'}`,
      stat: null,
      xp: 15,
      gold: 10,
      progress,
      goal,
      done: progress >= goal,
    });
  }

  // Slot 1: complete a habit of a particular stat.
  {
    const stats = STAT_ORDER.filter((s) => due.some((h) => h.stat === s));
    const stat = pick(stats, rand);
    const progress = doneHabits.some((h) => h.stat === stat) ? 1 : 0;
    quests.push({
      slot: 1,
      title: `Path of ${STATS[stat].name}`,
      detail: `Complete a ${STATS[stat].name} habit`,
      stat,
      xp: 10,
      gold: 8,
      progress,
      goal: 1,
      done: progress >= 1,
    });
  }

  // Slot 2: one harder challenge, chosen from whichever are possible today.
  {
    const scheduled = due.filter((h) => h.schedule.kind === 'weekdays');
    const challenging = due.filter((h) => h.difficulty === 'medium' || h.difficulty === 'hard');
    const quests2 = Object.values(data.quests).filter((q) => !q.deleted);
    const questAvailable = quests2.some((q) => q.doneDate === null || q.doneDate === date);

    const options: DailyQuest[] = [];
    if (scheduled.length >= 2) {
      const progress = scheduled.filter((h) => isDone(data, h.id, date)).length;
      options.push({
        slot: 2,
        title: 'Flawless day',
        detail: 'Complete every habit scheduled today',
        stat: null,
        xp: 30,
        gold: 20,
        progress,
        goal: scheduled.length,
        done: progress >= scheduled.length,
      });
    }
    if (challenging.length > 0) {
      const progress = challenging.some((h) => isDone(data, h.id, date)) ? 1 : 0;
      options.push({
        slot: 2,
        title: 'Rise to the challenge',
        detail: 'Complete a Medium or Hard habit',
        stat: null,
        xp: 15,
        gold: 10,
        progress,
        goal: 1,
        done: progress >= 1,
      });
    }
    if (questAvailable) {
      const progress = quests2.some((q) => q.doneDate === date) ? 1 : 0;
      options.push({
        slot: 2,
        title: 'Guild request',
        detail: 'Finish a quest from your quest log',
        stat: null,
        xp: 15,
        gold: 10,
        progress,
        goal: 1,
        done: progress >= 1,
      });
    }
    if (options.length > 0) quests.push(pick(options, rand));
  }

  return quests;
}

export function claimId(date: DateStr, slot: number): string {
  return `${date}|${slot}`;
}
