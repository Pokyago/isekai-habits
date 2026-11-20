import type { DateStr, SaveData, Subscription } from '../data/types';
import { addMonths, dayInMonth, monthOf, monthsBetween } from './format';

/** The first charge date on or after `from`. Charges before the anchor date don't exist. */
export function nextCharge(sub: Pick<Subscription, 'anchor' | 'cycle'>, from: DateStr): DateStr {
  const step = sub.cycle === 'yearly' ? 12 : 1;
  const day = Number(sub.anchor.slice(8));
  const start = monthOf(sub.anchor);
  const k = Math.max(0, Math.ceil(monthsBetween(start, monthOf(from)) / step));
  const date = dayInMonth(addMonths(start, k * step), day);
  return date >= from ? date : dayInMonth(addMonths(start, (k + 1) * step), day);
}

/** What it costs per month; a yearly one is spread over twelve months. */
export const perMonth = (sub: Pick<Subscription, 'amount' | 'cycle'>): number =>
  sub.cycle === 'yearly' ? Math.round(sub.amount / 12) : sub.amount;

export const perYear = (sub: Pick<Subscription, 'amount' | 'cycle'>): number =>
  sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;

export function activeSubscriptions(data: SaveData): Subscription[] {
  return Object.values(data.subscriptions).filter((s) => !s.deleted && s.active);
}

export interface SubscriptionTotals {
  count: number;
  perMonth: number;
  perYear: number;
  /** Monthly cost of the ones charged to the credit card. */
  onCard: number;
  /** Monthly cost of the ones taken from the bank account. */
  fromBank: number;
}

export function subscriptionTotals(data: SaveData): SubscriptionTotals {
  const totals: SubscriptionTotals = { count: 0, perMonth: 0, perYear: 0, onCard: 0, fromBank: 0 };
  for (const s of activeSubscriptions(data)) {
    totals.count++;
    totals.perMonth += perMonth(s);
    totals.perYear += perYear(s);
    if (s.paidWith === 'card') totals.onCard += perMonth(s);
    else totals.fromBank += perMonth(s);
  }
  return totals;
}

/** Active subscriptions with their next charge date, soonest first. */
export function upcomingCharges(data: SaveData, today: DateStr): { sub: Subscription; date: DateStr }[] {
  return activeSubscriptions(data)
    .map((sub) => ({ sub, date: nextCharge(sub, today) }))
    .sort((a, b) => (a.date === b.date ? a.sub.name.localeCompare(b.sub.name) : a.date < b.date ? -1 : 1));
}
