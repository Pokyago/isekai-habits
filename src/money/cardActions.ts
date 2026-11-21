import { newId } from '../data/actions';
import type { Card, DateStr, MonthStr, SaveData, Transaction } from '../data/types';
import { addDays } from '../game/dates';
import { ledgerReward } from './actions';
import { billFor, billKey, billOf, instalments } from './cards';
import { addMonths, dayInMonth, monthOf } from './format';

/* Changes to the credit cards and what is on them. Like the other actions, they return a new save. */

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) => Math.max(now, (prev?.updatedAt ?? 0) + 1);
const clampDay = (day: number) => Math.min(31, Math.max(1, Math.round(day)));

export interface CardInput {
  name: string;
  closingDay: number;
  dueDay: number;
  limit: number | null;
}

export function saveCard(data: SaveData, input: CardInput, id: string | undefined, now: number): SaveData {
  if (!input.name.trim()) return data;
  const prev = id ? data.cards[id] : undefined;
  const card: Card = {
    id: prev?.id ?? newId(),
    name: input.name.trim(),
    closingDay: clampDay(input.closingDay),
    dueDay: clampDay(input.dueDay),
    limit: input.limit !== null && input.limit > 0 ? Math.round(input.limit) : null,
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  return { ...data, cards: { ...data.cards, [card.id]: card } };
}

/** Takes the card off the list. What was bought on it stays in the records as spending. */
export function deleteCard(data: SaveData, id: string, now: number): SaveData {
  const prev = data.cards[id];
  if (!prev) return data;
  return { ...data, cards: { ...data.cards, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

export interface PurchaseInput {
  cardId: string;
  date: DateStr;
  /** The whole price, even when it is paid in instalments. */
  amount: number;
  category: string;
  note: string;
  /** How many monthly parts it is paid in; 1 for a normal purchase. */
  parts: number;
  /** The bill the purchase (or its first part) goes on. Worked out from the date when left out. */
  bill?: MonthStr;
}

/**
 * Records something bought on a card. Paid in instalments, it becomes one entry for
 * each part, a month apart, each on the following bill.
 */
export function addPurchase(data: SaveData, input: PurchaseInput, today: DateStr, now: number): SaveData {
  const card = data.cards[input.cardId];
  if (!data.money || !card || card.deleted || !(input.amount > 0)) return data;
  const shares = instalments(Math.round(input.amount), input.parts);
  const firstBill = input.bill ?? billFor(card, input.date);
  const base = newId();
  const day = Number(input.date.slice(8));
  const transactions = { ...data.transactions };
  shares.forEach((amount, i) => {
    const tx: Transaction = {
      id: shares.length === 1 ? base : `${base}|${i + 1}`,
      date: i === 0 ? input.date : dayInMonth(addMonths(monthOf(input.date), i), day),
      kind: 'expense',
      amount,
      category: input.category,
      note: input.note.trim(),
      goalId: null,
      debtId: null,
      source: 'manual',
      cardId: card.id,
      bill: addMonths(firstBill, i),
      ...(shares.length > 1 ? { plan: { id: base, part: i + 1, of: shares.length } } : {}),
      deleted: false,
      updatedAt: now,
    };
    transactions[tx.id] = tx;
  });
  return ledgerReward({ ...data, transactions }, today, now);
}

/** Removes every part of a purchase made in instalments. */
export function deletePlan(data: SaveData, planId: string, now: number): SaveData {
  let transactions = data.transactions;
  for (const t of Object.values(data.transactions)) {
    if (t.deleted || t.plan?.id !== planId) continue;
    if (transactions === data.transactions) transactions = { ...transactions };
    transactions[t.id] = { ...t, deleted: true, updatedAt: stamp(t, now) };
  }
  return transactions === data.transactions ? data : { ...data, transactions };
}

/** The category of a bill's payment, and of what was on a bill without being written down. */
export const CARD_CATEGORY = 'card';
export const NOT_ITEMISED = 'Not itemised';

/**
 * Pays a card's bill from the bank account. If more is paid than the purchases
 * written down add up to, the difference is put on the bill as one "not itemised"
 * purchase, so the spending is still counted and the bill comes out paid.
 */
export function payBill(
  data: SaveData,
  cardId: string,
  month: MonthStr,
  amount: number,
  date: DateStr,
  today: DateStr,
  now: number,
): SaveData {
  const card = data.cards[cardId];
  const paid = Math.round(amount);
  if (!data.money || !card || !(paid > 0)) return data;
  const bill = billOf(data, card, month, today);
  const transactions = { ...data.transactions };

  const extra = paid - bill.left;
  if (extra > 0) {
    // Dated the day before the bill closed (or the payment day, if that is earlier), so it counts in the bill's own period.
    const spentOn = addDays(bill.closes, -1);
    const id = newId();
    transactions[id] = {
      id,
      date: spentOn < date ? spentOn : date,
      kind: 'expense',
      amount: extra,
      category: CARD_CATEGORY,
      note: NOT_ITEMISED,
      goalId: null,
      debtId: null,
      source: 'manual',
      cardId,
      bill: month,
      deleted: false,
      updatedAt: now,
    };
  }

  const id = newId();
  transactions[id] = {
    id,
    date,
    kind: 'expense',
    amount: paid,
    category: CARD_CATEGORY,
    note: `${card.name} bill`,
    goalId: null,
    debtId: null,
    source: 'manual',
    paysBill: billKey(cardId, month),
    deleted: false,
    updatedAt: now,
  };
  return ledgerReward({ ...data, transactions }, today, now);
}

/**
 * Pays several bills of a card in one go, oldest first, each getting what is left on it.
 * The last one takes whatever remains of the amount, so paying more than was written
 * down ends up on it as "not itemised", and paying less leaves the later ones owed.
 */
export function payBills(
  data: SaveData,
  cardId: string,
  months: MonthStr[],
  amount: number,
  date: DateStr,
  today: DateStr,
  now: number,
): SaveData {
  const card = data.cards[cardId];
  if (!card) return data;
  const order = [...new Set(months)].sort();
  let left = Math.round(amount);
  let next = data;
  order.forEach((month, i) => {
    const last = i === order.length - 1;
    const pay = last ? left : Math.min(left, billOf(next, card, month, today).left);
    if (pay <= 0) return;
    next = payBill(next, cardId, month, pay, date, today, now + i);
    left -= pay;
  });
  return next;
}
