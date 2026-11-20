import type { DateStr, MonthStr } from '../data/types';

export const CURRENCIES: Record<string, { name: string; locale: string; decimal: ',' | '.' }> = {
  BRL: { name: 'Brazilian real (R$)', locale: 'pt-BR', decimal: ',' },
  USD: { name: 'US dollar ($)', locale: 'en-US', decimal: '.' },
  EUR: { name: 'Euro (€)', locale: 'pt-PT', decimal: ',' },
  GBP: { name: 'British pound (£)', locale: 'en-GB', decimal: '.' },
};

export const DEFAULT_CURRENCY = 'BRL';

const info = (currency: string) => CURRENCIES[currency] ?? CURRENCIES[DEFAULT_CURRENCY];
const formatters = new Map<string, Intl.NumberFormat>();

/** Cents to text in the currency's own style, e.g. 123456 → "R$ 1.234,56". */
export function formatMoney(cents: number, currency: string): string {
  let f = formatters.get(currency);
  if (!f) {
    const code = CURRENCIES[currency] ? currency : DEFAULT_CURRENCY;
    f = new Intl.NumberFormat(info(currency).locale, { style: 'currency', currency: code });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

/** Like formatMoney, with an explicit + or − in front. */
export function formatSigned(cents: number, currency: string): string {
  return `${cents < 0 ? '−' : '+'}${formatMoney(Math.abs(cents), currency)}`;
}

/** The number as you would type it into an amount box: "1234,56". */
export function amountText(cents: number, currency: string): string {
  return (cents / 100).toFixed(2).replace('.', info(currency).decimal);
}

/**
 * Reads a typed amount into cents. Accepts "12,50", "12.50", "1.234,56", "1,234.56"
 * and "R$ 40". Returns null if it isn't a number. The result is never negative.
 */
export function parseAmount(text: string, currency: string): number | null {
  const s = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  const decimal = info(currency).decimal;
  const other = decimal === ',' ? '.' : ',';
  const count = (ch: string) => s.split(ch).length - 1;
  const after = (ch: string) => s.length - s.lastIndexOf(ch) - 1;

  let sep = '';
  if (count(decimal) > 0 && count(other) > 0) {
    // Both used: whichever comes last is the decimal mark.
    sep = s.lastIndexOf(decimal) > s.lastIndexOf(other) ? decimal : other;
  } else if (count(decimal) === 1) {
    sep = decimal;
  } else if (count(other) === 1 && after(other) !== 3) {
    // "12.50" typed with the other mark; "1.234" would be a thousands separator.
    sep = other;
  }

  const cut = sep ? s.lastIndexOf(sep) : s.length;
  const whole = s.slice(0, cut).replace(/\D/g, '') || '0';
  const fraction = sep ? s.slice(cut + 1).replace(/\D/g, '') : '';
  const value = Number(`${whole}.${fraction || '0'}`);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

// ---------- months ----------

const pad = (n: number) => String(n).padStart(2, '0');

export const monthOf = (date: DateStr): MonthStr => date.slice(0, 7);

export function addMonths(month: MonthStr, n: number): MonthStr {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function daysInMonth(month: MonthStr): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** The date for a day-of-month in a month; shorter months use their last day. */
export function dayInMonth(month: MonthStr, day: number): DateStr {
  return `${month}-${pad(Math.min(Math.max(1, day), daysInMonth(month)))}`;
}

/** Whole months from `from` to `to` (negative if `to` is earlier). */
export function monthsBetween(from: MonthStr, to: MonthStr): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function formatMonth(month: MonthStr): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const wholeFormatters = new Map<string, Intl.NumberFormat>();

/** Cents to text without the cents, for chart axes: 1234567 → "R$ 12.346". */
export function formatWhole(cents: number, currency: string): string {
  let f = wholeFormatters.get(currency);
  if (!f) {
    const code = CURRENCIES[currency] ? currency : DEFAULT_CURRENCY;
    f = new Intl.NumberFormat(info(currency).locale, { style: 'currency', currency: code, maximumFractionDigits: 0 });
    wholeFormatters.set(currency, f);
  }
  return f.format(Math.round(cents / 100));
}

/** A short month name for a chart axis; January also carries the year: "Nov", "Jan 27". */
export function formatMonthShort(month: MonthStr): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Date(y, m - 1, 1, 12).toLocaleDateString(undefined, { month: 'short' });
  return m === 1 ? `${name} ${String(y).slice(2)}` : name;
}
