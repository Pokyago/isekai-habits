import type { DateStr, MonthStr, SaveData } from '../data/types';
import { addDays, daysBetween } from '../game/dates';
import { activeTransactions, balance, countsInBalance, monthSummary } from './calc';
import { ADJUSTMENT } from './categories';
import { addMonths, monthOf } from './format';

/* Series for the money charts. Amounts here are in cents, like everywhere else. */

export interface DatedAmount {
  date: DateStr;
  amount: number;
}

/**
 * The bank balance at the end of each day from `from` to `today`. The balance only
 * exists from the opening date, so the series never starts before it. Long spans
 * are thinned to one point a week (plus today) to keep the line readable.
 */
export function balanceSeries(data: SaveData, from: DateStr, today: DateStr): DatedAmount[] {
  if (!data.money) return [];
  const start = from > data.money.openingDate ? from : data.money.openingDate;
  if (start > today) return [];

  const change = new Map<DateStr, number>();
  for (const t of Object.values(data.transactions)) {
    if (!countsInBalance(data, t) || t.date < start || t.date > today) continue;
    change.set(t.date, (change.get(t.date) ?? 0) + (t.kind === 'income' ? t.amount : -t.amount));
  }

  const days = daysBetween(start, today);
  const every = days > 400 ? 7 : 1;
  const out: DatedAmount[] = [];
  let running = balance(data, addDays(start, -1));
  for (let i = 0; i <= days; i++) {
    const date = addDays(start, i);
    running += change.get(date) ?? 0;
    if (i % every === 0 || i === days) out.push({ date, amount: running });
  }
  return out;
}

/** The last `count` months, oldest first, ending with the month of `today`. */
export function lastMonths(today: DateStr, count: number): MonthStr[] {
  const end = monthOf(today);
  return Array.from({ length: count }, (_, i) => addMonths(end, i - (count - 1)));
}

/** The earliest month that has any entry, or null if there are none. */
export function firstMonthWithEntries(data: SaveData): MonthStr | null {
  let first: MonthStr | null = null;
  for (const t of activeTransactions(data)) {
    const m = monthOf(t.date);
    if (first === null || m < first) first = m;
  }
  return first;
}

export interface MonthFlow {
  month: MonthStr;
  income: number;
  /** Everything that went out. */
  out: number;
  /** What counts as spending (no debt payments, savings or corrections). */
  spent: number;
}

export function monthlyFlows(data: SaveData, months: MonthStr[]): MonthFlow[] {
  return months.map((month) => {
    const s = monthSummary(data, month);
    return { month, income: s.income, out: s.out, spent: s.spent };
  });
}

/** Spending categories used in the given months, biggest total first. */
export function categoryTotals(data: SaveData, months: MonthStr[]): { category: string; total: number }[] {
  const wanted = new Set(months);
  const totals = new Map<string, number>();
  for (const t of activeTransactions(data)) {
    if (t.kind !== 'expense' || t.category === ADJUSTMENT || !wanted.has(monthOf(t.date))) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  return [...totals.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

/** What went out in one category, month by month. */
export function categoryByMonth(data: SaveData, category: string, months: MonthStr[]): number[] {
  const index = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const t of activeTransactions(data)) {
    if (t.kind !== 'expense' || t.category !== category) continue;
    const i = index.get(monthOf(t.date));
    if (i !== undefined) out[i] += t.amount;
  }
  return out;
}
