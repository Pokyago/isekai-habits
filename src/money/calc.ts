import type { DateStr, Debt, Goal, MonthStr, SaveData, Transaction } from '../data/types';
import { ADJUSTMENT, NOT_SPENDING } from './categories';
import { daysInMonth, monthOf, monthsBetween } from './format';

export function activeTransactions(data: SaveData): Transaction[] {
  return Object.values(data.transactions).filter((t) => !t.deleted);
}

const signed = (t: Transaction) => (t.kind === 'income' ? t.amount : -t.amount);

/**
 * Whether a transaction changes the bank balance: only those on or after the opening
 * date do, and never something bought on a credit card (paying the card's bill does).
 */
export function countsInBalance(data: SaveData, t: Transaction): boolean {
  return data.money !== null && !t.deleted && !t.cardId && t.date >= data.money.openingDate;
}

/** The bank balance at the end of `asOf`: the opening balance plus everything since. */
export function balance(data: SaveData, asOf: DateStr): number {
  if (!data.money) return 0;
  let total = data.money.openingBalance;
  for (const t of Object.values(data.transactions)) {
    if (countsInBalance(data, t) && t.date <= asOf) total += signed(t);
  }
  return total;
}

export interface MonthSummary {
  income: number;
  /** Everything that left the bank account, including debt payments, savings and card bills paid. */
  out: number;
  /**
   * What counts against the budget: what was spent from the bank and on credit cards,
   * without debt payments, savings, corrections or the paying of card bills.
   */
  spent: number;
  /** Of that, what was bought on credit cards. */
  onCard: number;
  byCategory: { category: string; amount: number }[];
  count: number;
}

export function monthSummary(data: SaveData, month: MonthStr): MonthSummary {
  let income = 0;
  let out = 0;
  let spent = 0;
  let onCard = 0;
  let count = 0;
  const cats = new Map<string, number>();
  for (const t of activeTransactions(data)) {
    if (monthOf(t.date) !== month || t.category === ADJUSTMENT) continue;
    count++;
    if (t.kind === 'income') {
      income += t.amount;
      continue;
    }
    // Paying a card's bill leaves the bank, but what it paid for was already counted when it was bought.
    if (t.paysBill) {
      out += t.amount;
      continue;
    }
    // Bought on a card: spending now, out of the bank only when the bill is paid.
    if (t.cardId) onCard += t.amount;
    else out += t.amount;
    if (!NOT_SPENDING.has(t.category)) spent += t.amount;
    cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
  }
  const byCategory = [...cats.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { income, out, spent, onCard, byCategory, count };
}

export interface BudgetStatus {
  budget: number;
  spent: number;
  left: number;
  daysLeft: number;
  /** What can be spent per remaining day (today included) to stay inside the budget. */
  perDay: number;
}

export function budgetStatus(data: SaveData, today: DateStr): BudgetStatus | null {
  const budget = data.money?.budget;
  if (budget == null) return null;
  const month = monthOf(today);
  const spent = monthSummary(data, month).spent;
  const left = budget - spent;
  const daysLeft = daysInMonth(month) - Number(today.slice(8)) + 1;
  return { budget, spent, left, daysLeft, perDay: left > 0 ? Math.floor(left / daysLeft) : 0 };
}

/** Saved towards a goal: what was already put aside, plus linked money out, minus linked money back in. */
export function goalSaved(data: SaveData, goal: Goal): number {
  let total = goal.saved;
  for (const t of activeTransactions(data)) {
    if (t.goalId === goal.id) total += t.kind === 'expense' ? t.amount : -t.amount;
  }
  return Math.max(0, total);
}

export function debtPaid(data: SaveData, debt: Debt): number {
  let total = 0;
  for (const t of activeTransactions(data)) {
    if (t.debtId === debt.id && t.kind === 'expense') total += t.amount;
  }
  return total;
}

export const debtRemaining = (data: SaveData, debt: Debt): number => Math.max(0, debt.owed - debtPaid(data, debt));

/**
 * How much a month it takes to cover `remaining` by `targetDate`, counting this
 * month and the target's month. Null without a target date.
 */
export function perMonthNeeded(remaining: number, today: DateStr, targetDate: DateStr | null): number | null {
  if (!targetDate || remaining <= 0) return null;
  const months = Math.max(1, monthsBetween(monthOf(today), monthOf(targetDate)) + 1);
  return Math.ceil(remaining / months);
}
