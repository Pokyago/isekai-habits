import type { Card, DateStr, MonthStr, SaveData, Transaction } from '../data/types';
import { activeTransactions } from './calc';
import { addMonths, dayInMonth, monthOf } from './format';

/*
 * Credit cards. Something bought on a card is spending the day it is bought, but it
 * only leaves the bank account when the card's bill is paid. So a card purchase is an
 * entry marked with its card and the bill it is on; it counts in the month's spending
 * and not in the balance. Paying a bill is an ordinary entry that leaves the bank and
 * is marked as that bill's payment; it is not spending again.
 *
 * A bill is named by the month it is due in. It takes the purchases made before its
 * closing day; a purchase on the closing day or after goes on the next one.
 */

export const isCardPurchase = (t: Pick<Transaction, 'cardId'>): boolean => !!t.cardId;
export const isBillPayment = (t: Pick<Transaction, 'paysBill'>): boolean => !!t.paysBill;

export const billKey = (cardId: string, month: MonthStr) => `${cardId}|${month}`;

export function activeCards(data: SaveData): Card[] {
  return Object.values(data.cards)
    .filter((c) => !c.deleted)
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}

/** When the bill due in a month closes and when it is due. */
export function billDates(card: Pick<Card, 'closingDay' | 'dueDay'>, month: MonthStr): { closes: DateStr; due: DateStr } {
  // The closing day falls in the same month as the due day when it comes before it, else in the month before.
  const closingMonth = card.closingDay < card.dueDay ? month : addMonths(month, -1);
  return { closes: dayInMonth(closingMonth, card.closingDay), due: dayInMonth(month, card.dueDay) };
}

/** The bill a purchase made on a date goes on: the first one that closes after that day. */
export function billFor(card: Pick<Card, 'closingDay' | 'dueDay'>, date: DateStr): MonthStr {
  let month = addMonths(monthOf(date), -1);
  while (billDates(card, month).closes <= date) month = addMonths(month, 1);
  return month;
}

export type BillStatus = 'open' | 'closed' | 'overdue' | 'paid' | 'empty';

export interface Bill {
  card: Card;
  /** The month the bill is due in. */
  month: MonthStr;
  closes: DateStr;
  due: DateStr;
  /** What was bought, oldest first. */
  purchases: Transaction[];
  /** Payments made from the bank account, oldest first. */
  payments: Transaction[];
  total: number;
  paid: number;
  /** Still to pay. */
  left: number;
  /**
   * 'open': still taking purchases. 'closed': waiting to be paid. 'overdue': past its due
   * date with something left. 'paid': nothing left. 'empty': closed with nothing on it.
   */
  status: BillStatus;
}

const byDate = (a: Transaction, b: Transaction) => (a.date === b.date ? a.updatedAt - b.updatedAt : a.date < b.date ? -1 : 1);

function makeBill(card: Card, month: MonthStr, purchases: Transaction[], payments: Transaction[], today: DateStr): Bill {
  const { closes, due } = billDates(card, month);
  const total = purchases.reduce((n, t) => n + t.amount, 0);
  const paid = payments.reduce((n, t) => n + t.amount, 0);
  const left = Math.max(0, total - paid);
  const status: BillStatus =
    total > 0 && left === 0 ? 'paid' : today < closes ? 'open' : total === 0 ? 'empty' : today > due ? 'overdue' : 'closed';
  return { card, month, closes, due, purchases: purchases.sort(byDate), payments: payments.sort(byDate), total, paid, left, status };
}

/** One bill of a card. */
export function billOf(data: SaveData, card: Card, month: MonthStr, today: DateStr): Bill {
  const key = billKey(card.id, month);
  const all = activeTransactions(data);
  return makeBill(
    card,
    month,
    all.filter((t) => t.cardId === card.id && t.bill === month),
    all.filter((t) => t.paysBill === key),
    today,
  );
}

/**
 * Every bill of a card that has anything on it, plus the one that is open now, oldest
 * first. Bills still to come that only hold later instalments are included.
 */
export function cardBills(data: SaveData, card: Card, today: DateStr): Bill[] {
  const purchases = new Map<MonthStr, Transaction[]>();
  const payments = new Map<MonthStr, Transaction[]>();
  const add = (map: Map<MonthStr, Transaction[]>, month: MonthStr, t: Transaction) => {
    const list = map.get(month);
    if (list) list.push(t);
    else map.set(month, [t]);
  };
  const prefix = `${card.id}|`;
  for (const t of activeTransactions(data)) {
    if (t.cardId === card.id && t.bill) add(purchases, t.bill, t);
    else if (t.paysBill?.startsWith(prefix)) add(payments, t.paysBill.slice(prefix.length), t);
  }
  const months = new Set([...purchases.keys(), ...payments.keys(), billFor(card, today)]);
  return [...months].sort().map((m) => makeBill(card, m, purchases.get(m) ?? [], payments.get(m) ?? [], today));
}

export interface CardSummary {
  card: Card;
  bills: Bill[];
  /** The bill that is taking purchases now. */
  open: Bill;
  /** Bills that have closed and still have something to pay, oldest first. */
  toPay: Bill[];
  /** Left to pay on the bills up to and including the open one. */
  owedNow: number;
  /** Instalments that fall on bills after the open one. */
  later: number;
  /** Everything not yet paid: what the card's limit is used for. */
  owed: number;
}

export function cardSummary(data: SaveData, card: Card, today: DateStr): CardSummary {
  const bills = cardBills(data, card, today);
  const openMonth = billFor(card, today);
  const open = bills.find((b) => b.month === openMonth)!;
  const toPay = bills.filter((b) => b.month < openMonth && b.left > 0);
  const owedNow = toPay.reduce((n, b) => n + b.left, 0) + open.left;
  const later = bills.filter((b) => b.month > openMonth).reduce((n, b) => n + b.left, 0);
  return { card, bills, open, toPay, owedNow, later, owed: owedNow + later };
}

/** Across all cards: what is left to pay on the bills so far, and on the ones still to come. */
export function cardsOwed(data: SaveData, today: DateStr): { now: number; later: number } {
  let now = 0;
  let later = 0;
  for (const card of activeCards(data)) {
    const s = cardSummary(data, card, today);
    now += s.owedNow;
    later += s.later;
  }
  return { now, later };
}

/** Closed bills with something left to pay, from every card, soonest due first. */
export function billsToPay(data: SaveData, today: DateStr): Bill[] {
  return activeCards(data)
    .flatMap((card) => cardSummary(data, card, today).toPay)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/** Splits an amount into equal parts in whole cents; the first part takes what is left over. */
export function instalments(total: number, parts: number): number[] {
  const n = Math.min(48, Math.max(1, Math.round(parts)));
  const each = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? total - each * (n - 1) : each));
}
