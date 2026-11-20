import type { DateStr } from '../data/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses at local noon so daylight-saving shifts never change the calendar day. */
export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayStr(): DateStr {
  return toDateStr(new Date());
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(s: DateStr): number {
  return parseDate(s).getDay();
}

/** The Monday of the week containing the date. */
export function weekStart(s: DateStr): DateStr {
  return addDays(s, -((weekday(s) + 6) % 7));
}

export function daysBetween(from: DateStr, to: DateStr): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

export function formatLong(s: DateStr): string {
  return parseDate(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatShort(s: DateStr): string {
  return parseDate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
