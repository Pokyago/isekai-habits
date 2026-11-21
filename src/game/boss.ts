import type { DateStr, Difficulty, QuestClaim, SaveData } from '../data/types';
import { addDays, daysBetween, weekStart } from './dates';
import { isActiveOn, isDone, isDueOn, weekCount } from './schedule';

/*
 * The weekly boss. Every Monday a monster turns up; each habit done that week hurts
 * it, harder habits more. Its health is a share of everything scheduled for the
 * week, so it can be beaten without a perfect week and a bad day can be made up for.
 * Beating it by Sunday earns a chest. If it survives, nothing is lost.
 *
 * Like everything else it is worked out from the records. Only the chest is stored,
 * as a claim, so two devices can't both open it.
 */

/** How hard a habit hits. */
export const DAMAGE: Record<Difficulty, number> = { trivial: 1, easy: 2, medium: 3, hard: 5 };
/** The boss has this share of all the damage the week's habits could do. */
export const BOSS_SHARE = 0.7;
/** What is in the chest. */
export const BOSS_REWARD = { xp: 60, gold: 80 };

export type BossKind = 'slime' | 'bat' | 'golem' | 'wraith' | 'drake' | 'mimic';

export const BOSSES: { kind: BossKind; name: string; taunt: string }[] = [
  { kind: 'slime', name: 'Gloom Slime', taunt: 'It grows on days when nothing gets done.' },
  { kind: 'bat', name: 'Dusk Bat', taunt: 'It feeds on late nights and skipped mornings.' },
  { kind: 'golem', name: 'Idle Golem', taunt: 'It has not moved in years, and wants company.' },
  { kind: 'wraith', name: 'Tomorrow Wraith', taunt: 'It whispers that tomorrow is soon enough.' },
  { kind: 'drake', name: 'Sloth Drake', taunt: 'It sleeps on a hoard of things left undone.' },
  { kind: 'mimic', name: 'Snooze Mimic', taunt: 'It looks like five more minutes.' },
];

export interface Boss {
  /** The Monday of its week. */
  week: DateStr;
  kind: BossKind;
  name: string;
  taunt: string;
  maxHp: number;
  /** Damage done so far, never more than its health. */
  damage: number;
  hp: number;
  defeated: boolean;
  /** Days left to beat it, today included; 0 once the week is over. */
  daysLeft: number;
  /** The chest has been opened. */
  claimed: boolean;
}

export const bossId = (week: DateStr) => `boss|${week}`;

/** The same boss for the same week on every device, and a different one from the week before: they take turns. */
function pick(week: DateStr) {
  const weeks = Math.floor(daysBetween('2024-01-01', week) / 7);
  return BOSSES[((weeks % BOSSES.length) + BOSSES.length) % BOSSES.length];
}

/** The boss of the week a day is in, or null when no habits are scheduled that week. */
export function bossFor(data: SaveData, anyDay: DateStr, today: DateStr): Boss | null {
  const week = weekStart(anyDay);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  let possible = 0;
  let damage = 0;
  for (const h of Object.values(data.habits)) {
    if (h.deleted) continue;
    const hit = DAMAGE[h.difficulty];
    if (h.schedule.kind === 'perWeek') {
      if (!days.some((d) => isActiveOn(h, d))) continue;
      possible += h.schedule.times * hit;
      damage += Math.min(h.schedule.times, weekCount(data, h.id, week)) * hit;
    } else {
      for (const d of days) {
        if (!isDueOn(h, d, data)) continue;
        possible += hit;
        if (isDone(data, h.id, d)) damage += hit;
      }
    }
  }
  if (possible === 0) return null;
  const maxHp = Math.max(1, Math.ceil(possible * BOSS_SHARE));
  const dealt = Math.min(damage, maxHp);
  const end = addDays(week, 6);
  return {
    week,
    ...pick(week),
    maxHp,
    damage: dealt,
    hp: maxHp - dealt,
    defeated: dealt >= maxHp,
    daysLeft: today > end ? 0 : daysBetween(today < week ? week : today, end) + 1,
    claimed: data.claims[bossId(week)]?.claimed ?? false,
  };
}

/** How many bosses have been beaten. */
export function bossesDefeated(data: SaveData): number {
  let n = 0;
  for (const c of Object.values(data.claims)) if (c.claimed && c.id.startsWith('boss|')) n++;
  return n;
}

/**
 * Opens the chest when the boss of a day's week has just been beaten, and takes it
 * back if a habit is unticked and the boss is standing again, the way daily quests do.
 */
export function settleBoss(data: SaveData, date: DateStr, now: number): SaveData {
  const boss = bossFor(data, date, date);
  const id = bossId(weekStart(date));
  const prev = data.claims[id];
  const beaten = boss?.defeated ?? false;
  if ((prev?.claimed ?? false) === beaten) return data;
  const claim: QuestClaim = {
    id,
    date,
    slot: -1,
    stat: null,
    claimed: beaten,
    xp: beaten ? BOSS_REWARD.xp : 0,
    gold: beaten ? BOSS_REWARD.gold : 0,
    updatedAt: Math.max(now, (prev?.updatedAt ?? 0) + 1),
  };
  return { ...data, claims: { ...data.claims, [id]: claim } };
}
