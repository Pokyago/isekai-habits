import type { DateStr, SaveData, Subscription } from '../data/types';
import { addMonths, dayInMonth, monthOf, monthsBetween } from './format';

/*
 * Fixed costs: things paid at a set price every month or every year. They come in
 * two kinds kept on separate pages, subscriptions and monthly bills, and work the same way.
 */

export type ChargeType = 'subscription' | 'bill';

export const chargeType = (sub: Pick<Subscription, 'type'>): ChargeType => sub.type ?? 'subscription';

/** The spending category its entries are filed under. */
export const chargeCategory = (sub: Pick<Subscription, 'type' | 'category'>): string =>
  sub.category ?? (chargeType(sub) === 'bill' ? 'bills' : 'subscriptions');

/** True when it is paid at some point in the month or year, with no set day. */
export const isFloating = (sub: Pick<Subscription, 'floating'>): boolean => sub.floating === true;

/** The first charge date on or after `from`. Charges before the anchor date don't exist. Only for ones with a set day. */
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

/** The ones still being paid. Without a type, both subscriptions and bills. */
export function activeSubscriptions(data: SaveData, type?: ChargeType): Subscription[] {
  return Object.values(data.subscriptions).filter(
    (s) => !s.deleted && s.active && (type === undefined || chargeType(s) === type),
  );
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

export function subscriptionTotals(data: SaveData, type: ChargeType = 'subscription'): SubscriptionTotals {
  const totals: SubscriptionTotals = { count: 0, perMonth: 0, perYear: 0, onCard: 0, fromBank: 0 };
  for (const s of activeSubscriptions(data, type)) {
    totals.count++;
    totals.perMonth += perMonth(s);
    totals.perYear += perYear(s);
    if (s.paidWith === 'card') totals.onCard += perMonth(s);
    else totals.fromBank += perMonth(s);
  }
  return totals;
}

/** Active ones paid on a set day, with their next charge date, soonest first. Without a type, both kinds together. */
export function upcomingCharges(data: SaveData, today: DateStr, type?: ChargeType): { sub: Subscription; date: DateStr }[] {
  return activeSubscriptions(data, type)
    .filter((sub) => !isFloating(sub))
    .map((sub) => ({ sub, date: nextCharge(sub, today) }))
    .sort((a, b) => (a.date === b.date ? a.sub.name.localeCompare(b.sub.name) : a.date < b.date ? -1 : 1));
}

/** Active ones with no set day, monthly before yearly, then by name. */
export function floatingCharges(data: SaveData, type?: ChargeType): Subscription[] {
  return activeSubscriptions(data, type)
    .filter(isFloating)
    .sort((a, b) => (a.cycle === b.cycle ? a.name.localeCompare(b.name) : a.cycle === 'monthly' ? -1 : 1));
}

export interface FixedCosts {
  subscriptions: SubscriptionTotals;
  bills: SubscriptionTotals;
  /** Monthly expenses set to repeat on the Debts & goals page (rent, instalments) that apply this month. */
  other: { count: number; perMonth: number };
  perMonth: number;
  perYear: number;
}

/** Everything that leaves every month whatever else happens: subscriptions, monthly bills and other repeating expenses. */
export function fixedCosts(data: SaveData, today: DateStr): FixedCosts {
  const subscriptions = subscriptionTotals(data, 'subscription');
  const bills = subscriptionTotals(data, 'bill');
  const month = monthOf(today);
  const other = { count: 0, perMonth: 0 };
  for (const r of Object.values(data.recurring)) {
    if (r.deleted || r.kind !== 'expense' || r.startMonth > month || (r.endMonth !== null && r.endMonth < month)) continue;
    other.count++;
    other.perMonth += r.amount;
  }
  return {
    subscriptions,
    bills,
    other,
    perMonth: subscriptions.perMonth + bills.perMonth + other.perMonth,
    perYear: subscriptions.perYear + bills.perYear + other.perMonth * 12,
  };
}
