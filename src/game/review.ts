import type { DateStr, SaveData, StatKey } from '../data/types';
import { activeTransactions } from '../money/calc';
import { ADJUSTMENT, NOT_SPENDING } from '../money/categories';
import { careDay, companion, type CareDay } from './companion';
import { addDays, toDateStr, weekStart } from './dates';
import { isActiveOn, isDone, isDueOn, weekCount } from './schedule';

/** XP earned from everything dated between two days (both included). */
export function xpBetween(data: SaveData, from: DateStr, to: DateStr): number {
  const within = (date: DateStr | null) => date !== null && date >= from && date <= to;
  let xp = 0;
  for (const c of Object.values(data.completions)) if (c.done && within(c.date)) xp += c.xp;
  for (const c of Object.values(data.claims)) if (c.claimed && within(c.date)) xp += c.xp;
  for (const q of Object.values(data.quests)) if (within(q.doneDate)) xp += q.xp;
  for (const p of Object.values(data.plan)) if (p.done && within(p.date)) xp += p.xp;
  for (const m of Object.values(data.meals)) if (m.done && within(m.date)) xp += m.xp;
  return xp;
}

/** One habit over a week: how often it was to be done, and how often it was. */
export interface HabitWeek {
  id: string;
  name: string;
  stat: StatKey;
  due: number;
  done: number;
}

/** A Monday-to-Sunday week looked back on. In the current week, only the days so far count. */
export interface WeekReview {
  start: DateStr;
  end: DateStr;
  /** Seven days, Monday first. `ahead` marks the days that haven't come yet. */
  days: (CareDay & { ahead: boolean })[];
  due: number;
  done: number;
  /** Share of the scheduled habits that were done, 0–1, or null when nothing was scheduled. */
  share: number | null;
  /** Days on which every scheduled habit was done. */
  flawless: number;
  xp: number;
  quests: number;
  goalsSet: number;
  goalsMet: number;
  mealsPlanned: number;
  mealsEaten: number;
  sleepNights: number;
  sleepAverage: number | null;
  /** Null when money isn't set up. Amounts are in cents. */
  money: { spent: number; income: number } | null;
  /** The habits of the week, the ones that slipped most first. */
  habits: HabitWeek[];
  /** The heroine's morale as the week ended (or as it stands today). */
  morale: number;
}

export function weekReview(data: SaveData, anyDay: DateStr, today: DateStr): WeekReview {
  const start = weekStart(anyDay);
  const end = addDays(start, 6);
  const last = end < today ? end : today;
  const within = (date: DateStr | null) => date !== null && date >= start && date <= last;

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { ...careDay(data, date), ahead: date > today };
  });
  const past = days.filter((d) => !d.ahead);
  const due = past.reduce((n, d) => n + d.due, 0);
  const done = past.reduce((n, d) => n + d.done, 0);

  const habits: HabitWeek[] = [];
  for (const h of Object.values(data.habits)) {
    if (h.deleted) continue;
    let hDue = 0;
    let hDone = 0;
    if (h.schedule.kind === 'perWeek') {
      if (!past.some((d) => isActiveOn(h, d.date))) continue;
      hDue = h.schedule.times;
      hDone = Math.min(hDue, weekCount(data, h.id, start));
    } else {
      for (const d of past) {
        if (!isDueOn(h, d.date, data)) continue;
        hDue++;
        if (isDone(data, h.id, d.date)) hDone++;
      }
    }
    if (hDue > 0) habits.push({ id: h.id, name: h.name, stat: h.stat, due: hDue, done: hDone });
  }
  habits.sort((a, b) => a.done / a.due - b.done / b.due || b.due - a.due || a.name.localeCompare(b.name));

  const goals = Object.values(data.plan).filter((p) => p.main && !p.deleted && p.title.trim() !== '' && within(p.date));
  const meals = Object.values(data.meals).filter((m) => m.text !== '' && within(m.date));
  const nights = Object.values(data.sleep).filter((s) => !s.deleted && within(s.date));

  let money: WeekReview['money'] = null;
  if (data.money) {
    money = { spent: 0, income: 0 };
    for (const t of activeTransactions(data)) {
      if (!within(t.date) || t.category === ADJUSTMENT) continue;
      if (t.kind === 'income') money.income += t.amount;
      // As on the Money page: debt payments and savings are not spending.
      else if (!NOT_SPENDING.has(t.category)) money.spent += t.amount;
    }
  }

  return {
    start,
    end,
    days,
    due,
    done,
    share: due > 0 ? done / due : null,
    flawless: past.filter((d) => d.due > 0 && d.done === d.due).length,
    xp: xpBetween(data, start, last),
    quests: Object.values(data.quests).filter((q) => !q.deleted && within(q.doneDate)).length,
    goalsSet: goals.length,
    goalsMet: goals.filter((g) => g.done).length,
    mealsPlanned: meals.length,
    mealsEaten: meals.filter((m) => m.done).length,
    sleepNights: nights.length,
    sleepAverage: nights.length > 0 ? nights.reduce((n, s) => n + s.hours, 0) / nights.length : null,
    money,
    habits,
    morale: companion(data, last).morale,
  };
}

/** A sentence on how the week went. */
export function weekVerdict(share: number | null): string {
  if (share === null) return 'Nothing was scheduled this week.';
  // Judged on the rounded figure that is shown, so 70% never reads as less than 70.
  const percent = Math.round(share * 100);
  if (percent >= 90) return 'A week to be proud of.';
  if (percent >= 70) return 'A good week. Most of it got done.';
  if (percent >= 40) return 'A mixed week. The next one can be better.';
  return 'A hard week. One small habit is the way back.';
}

/** The first week there is anything to look back on: the one the hero was summoned in. */
export function firstWeek(data: SaveData, today: DateStr): DateStr {
  return weekStart(data.hero ? toDateStr(new Date(data.hero.createdAt)) : today);
}

/** The heroine's morale at the end of each of the last days, oldest first, from the day she was summoned. */
export function moraleHistory(data: SaveData, today: DateStr, days = 28): { date: DateStr; value: number }[] {
  const born = data.hero ? toDateStr(new Date(data.hero.createdAt)) : today;
  const out: { date: DateStr; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (date < born) continue;
    out.push({ date, value: companion(data, date).morale });
  }
  return out;
}
