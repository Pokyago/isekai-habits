import { newId } from '../data/actions';
import type {
  DateStr,
  Debt,
  Goal,
  MonthStr,
  QuestClaim,
  Recurring,
  SaveData,
  Subscription,
  Transaction,
  TxKind,
} from '../data/types';
import { addDays, parseDate } from '../game/dates';
import { balance, debtRemaining, goalSaved, monthSummary } from './calc';
import { ADJUSTMENT } from './categories';
import { addMonths, dayInMonth, monthOf } from './format';
import type { ImportRow } from './statement';
import { chargeCategory, isFloating, nextCharge } from './subscriptions';

/*
 * Every change to the money records goes through these functions. Like the game
 * actions, they return a new save and take `today`/`now` as arguments.
 */

/** First time spending is logged on a day. */
export const LEDGER_REWARD = { xp: 5, gold: 3 };
/** A month that ends within its budget. */
export const BUDGET_REWARD = { xp: 50, gold: 30 };
/** A savings goal reached or a debt cleared. */
export const MILESTONE_REWARD = { xp: 100, gold: 50 };
/** A month's budget is judged this many days into the next month, leaving time to log its last days. */
export const BUDGET_GRACE_DAYS = 3;

const stamp = (prev: { updatedAt: number } | undefined | null, now: number) =>
  Math.max(now, (prev?.updatedAt ?? 0) + 1);

/** Records a money reward once. If it was already decided, either way, nothing changes. */
function decide(data: SaveData, id: string, date: DateStr, reward: { xp: number; gold: number } | null, now: number): SaveData {
  if (data.claims[id]) return data;
  const claim: QuestClaim = {
    id,
    date,
    slot: -1,
    stat: reward ? 'for' : null,
    claimed: reward !== null,
    xp: reward?.xp ?? 0,
    gold: reward?.gold ?? 0,
    updatedAt: now,
  };
  return { ...data, claims: { ...data.claims, [id]: claim } };
}

export function setupMoney(
  data: SaveData,
  openingBalance: number,
  budget: number | null,
  currency: string,
  today: DateStr,
  now: number,
): SaveData {
  return {
    ...data,
    money: { currency, openingBalance, openingDate: today, budget, updatedAt: stamp(data.money, now) },
  };
}

export function updateMoney(data: SaveData, patch: { budget?: number | null; currency?: string }, now: number): SaveData {
  if (!data.money) return data;
  return { ...data, money: { ...data.money, ...patch, updatedAt: stamp(data.money, now) } };
}

export interface TxInput {
  date: DateStr;
  kind: TxKind;
  amount: number;
  category: string;
  note: string;
  goalId: string | null;
  debtId: string | null;
}

export function saveTransaction(data: SaveData, input: TxInput, id: string | undefined, today: DateStr, now: number): SaveData {
  if (!data.money || !(input.amount > 0)) return data;
  const prev = id ? data.transactions[id] : undefined;
  const tx: Transaction = {
    id: prev?.id ?? newId(),
    ...input,
    amount: Math.round(input.amount),
    note: input.note.trim(),
    source: prev?.source ?? 'manual',
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  const next = { ...data, transactions: { ...data.transactions, [tx.id]: tx } };
  return prev ? next : decide(next, `ledger|${today}`, today, LEDGER_REWARD, now);
}

export function deleteTransaction(data: SaveData, id: string, now: number): SaveData {
  const prev = data.transactions[id];
  if (!prev) return data;
  // Kept as a marker so a recurring or imported item isn't added again.
  return { ...data, transactions: { ...data.transactions, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

/** Makes the balance on `date` equal to `actual` by adding a correction for the difference. */
export function correctBalance(data: SaveData, actual: number, date: DateStr, now: number): SaveData {
  if (!data.money || date < data.money.openingDate) return data;
  const diff = Math.round(actual) - balance(data, date);
  if (diff === 0) return data;
  const tx: Transaction = {
    id: newId(),
    date,
    kind: diff > 0 ? 'income' : 'expense',
    amount: Math.abs(diff),
    category: ADJUSTMENT,
    note: 'Balance correction',
    goalId: null,
    debtId: null,
    source: 'manual',
    deleted: false,
    updatedAt: now,
  };
  return { ...data, transactions: { ...data.transactions, [tx.id]: tx } };
}

export interface RecurringInput {
  name: string;
  kind: TxKind;
  amount: number;
  category: string;
  day: number;
  startMonth: MonthStr;
  endMonth: MonthStr | null;
  goalId: string | null;
  debtId: string | null;
}

export function saveRecurring(data: SaveData, input: RecurringInput, id: string | undefined, now: number): SaveData {
  if (!input.name.trim() || !(input.amount > 0)) return data;
  const prev = id ? data.recurring[id] : undefined;
  const item: Recurring = {
    id: prev?.id ?? newId(),
    ...input,
    name: input.name.trim(),
    amount: Math.round(input.amount),
    day: Math.min(31, Math.max(1, Math.round(input.day))),
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  return { ...data, recurring: { ...data.recurring, [item.id]: item } };
}

/** Stops it from being added in future. What it already added stays. */
export function deleteRecurring(data: SaveData, id: string, now: number): SaveData {
  const prev = data.recurring[id];
  if (!prev) return data;
  return { ...data, recurring: { ...data.recurring, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

export interface SubscriptionInput {
  name: string;
  amount: number;
  cycle: 'monthly' | 'yearly';
  /** A date it is charged on; usually the next one. */
  anchor: DateStr;
  /** Paid at some point in the month or year, with no set day. */
  floating?: boolean;
  paidWith: 'bank' | 'card' | 'manual';
  active: boolean;
  note: string;
  /** 'bill' for a monthly bill; leave out for a subscription. */
  type?: 'bill';
  category?: string;
}

export function saveSubscription(
  data: SaveData,
  input: SubscriptionInput,
  id: string | undefined,
  today: DateStr,
  now: number,
): SaveData {
  if (!input.name.trim() || !(input.amount > 0)) return data;
  const prev = id ? data.subscriptions[id] : undefined;
  const { floating, ...rest } = input;
  const sub: Subscription = {
    id: prev?.id ?? newId(),
    ...rest,
    // Without a day there is no day to add an entry on: it can only be tracked.
    ...(floating ? { floating: true as const, paidWith: rest.paidWith === 'bank' ? ('manual' as const) : rest.paidWith } : {}),
    // What kind of thing it is never changes after it is added.
    type: prev ? prev.type : input.type,
    name: input.name.trim(),
    note: input.note.trim(),
    amount: Math.round(input.amount),
    since: prev?.since ?? today,
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  return { ...data, subscriptions: { ...data.subscriptions, [sub.id]: sub } };
}

/** Removes it from the list. Entries it already added stay. */
export function deleteSubscription(data: SaveData, id: string, now: number): SaveData {
  const prev = data.subscriptions[id];
  if (!prev) return data;
  return {
    ...data,
    subscriptions: { ...data.subscriptions, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } },
  };
}

export interface GoalInput {
  name: string;
  target: number;
  saved: number;
  targetDate: DateStr | null;
}

export function saveGoal(data: SaveData, input: GoalInput, id: string | undefined, now: number): SaveData {
  if (!input.name.trim() || !(input.target > 0)) return data;
  const prev = id ? data.goals[id] : undefined;
  const goal: Goal = {
    id: prev?.id ?? newId(),
    name: input.name.trim(),
    target: Math.round(input.target),
    saved: Math.max(0, Math.round(input.saved)),
    targetDate: input.targetDate,
    createdAt: prev?.createdAt ?? now,
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  return { ...data, goals: { ...data.goals, [goal.id]: goal } };
}

export function deleteGoal(data: SaveData, id: string, now: number): SaveData {
  const prev = data.goals[id];
  if (!prev) return data;
  return { ...data, goals: { ...data.goals, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

export interface DebtInput {
  name: string;
  owed: number;
  targetDate: DateStr | null;
}

export function saveDebt(data: SaveData, input: DebtInput, id: string | undefined, now: number): SaveData {
  if (!input.name.trim() || !(input.owed > 0)) return data;
  const prev = id ? data.debts[id] : undefined;
  const debt: Debt = {
    id: prev?.id ?? newId(),
    name: input.name.trim(),
    owed: Math.round(input.owed),
    targetDate: input.targetDate,
    createdAt: prev?.createdAt ?? now,
    deleted: false,
    updatedAt: stamp(prev, now),
  };
  return { ...data, debts: { ...data.debts, [debt.id]: debt } };
}

export function deleteDebt(data: SaveData, id: string, now: number): SaveData {
  const prev = data.debts[id];
  if (!prev) return data;
  return { ...data, debts: { ...data.debts, [id]: { ...prev, deleted: true, updatedAt: stamp(prev, now) } } };
}

/** Adds rows from a bank statement. Rows whose id is already in the save are left alone. */
export function importRows(data: SaveData, rows: ImportRow[], today: DateStr, now: number): SaveData {
  if (!data.money) return data;
  const transactions = { ...data.transactions };
  let added = 0;
  for (const r of rows) {
    if (transactions[r.id]) continue;
    transactions[r.id] = {
      id: r.id,
      date: r.date,
      kind: r.kind,
      amount: r.amount,
      category: r.category,
      note: r.note,
      goalId: null,
      debtId: null,
      source: 'import',
      deleted: false,
      updatedAt: now,
    };
    added++;
  }
  if (added === 0) return data;
  return decide({ ...data, transactions }, `ledger|${today}`, today, LEDGER_REWARD, now);
}

/**
 * Adds the monthly items that have come due. Each one's id is made from the
 * recurring item and the month, so two devices adding the same one end up with a
 * single record, and one the user deleted is not added again.
 */
function addDueRecurring(data: SaveData, today: DateStr): SaveData {
  if (!data.money) return data;
  const thisMonth = monthOf(today);
  let transactions = data.transactions;

  for (const r of Object.values(data.recurring)) {
    if (r.deleted) continue;
    for (let m = r.startMonth; m <= thisMonth && (r.endMonth === null || m <= r.endMonth); m = addMonths(m, 1)) {
      const date = dayInMonth(m, r.day);
      if (date > today) break;
      if (date < data.money.openingDate) continue;
      const id = `rec|${r.id}|${m}`;
      if (transactions[id]) continue;
      if (transactions === data.transactions) transactions = { ...transactions };
      transactions[id] = {
        id,
        date,
        kind: r.kind,
        amount: r.amount,
        category: r.category,
        note: r.name,
        goalId: r.goalId,
        debtId: r.debtId,
        source: 'recurring',
        deleted: false,
        // Fixed, and earlier than any later edit, so every device creates an identical record.
        updatedAt: parseDate(date).getTime(),
      };
    }
  }
  return transactions === data.transactions ? data : { ...data, transactions };
}

/**
 * Adds an entry for each charge that has come due on a subscription paid from the
 * bank account. Ones on the credit card add nothing: they are already in the card bill.
 * Like the monthly items, ids are made from the subscription and the period.
 */
function addDueSubscriptions(data: SaveData, today: DateStr): SaveData {
  if (!data.money) return data;
  let transactions = data.transactions;

  for (const s of Object.values(data.subscriptions)) {
    if (s.deleted || !s.active || s.paidWith !== 'bank' || isFloating(s)) continue;
    const from = s.since > data.money.openingDate ? s.since : data.money.openingDate;
    for (let date = nextCharge(s, from); date <= today; date = nextCharge(s, addDays(date, 1))) {
      const id = `sub|${s.id}|${s.cycle === 'yearly' ? date.slice(0, 4) : date.slice(0, 7)}`;
      if (transactions[id]) continue;
      if (transactions === data.transactions) transactions = { ...transactions };
      transactions[id] = {
        id,
        date,
        kind: 'expense',
        amount: s.amount,
        category: chargeCategory(s),
        note: s.name,
        goalId: null,
        debtId: null,
        source: 'recurring',
        deleted: false,
        updatedAt: parseDate(date).getTime(),
      };
    }
  }
  return transactions === data.transactions ? data : { ...data, transactions };
}

/** Judges each finished month against the budget, once, a few days after it ends. */
function settleBudgets(data: SaveData, today: DateStr): SaveData {
  if (!data.money) return data;
  let next = data;
  const thisMonth = monthOf(today);
  for (let m = monthOf(data.money.openingDate); m < thisMonth; m = addMonths(m, 1)) {
    const judgedOn = dayInMonth(addMonths(m, 1), 1 + BUDGET_GRACE_DAYS);
    if (judgedOn > today) break;
    const id = `budget|${m}`;
    if (next.claims[id]) continue;
    const { spent, count } = monthSummary(next, m);
    const budget = next.money!.budget;
    const kept = budget !== null && count > 0 && spent <= budget;
    // Dated by the judging day rather than the clock, so two devices write the same record.
    next = decide(next, id, judgedOn, kept ? BUDGET_REWARD : null, parseDate(judgedOn).getTime());
  }
  return next;
}

/** One-off rewards for reaching a savings goal or clearing a debt. */
function settleMilestones(data: SaveData, today: DateStr, now: number): SaveData {
  let next = data;
  for (const goal of Object.values(data.goals)) {
    if (!goal.deleted && goalSaved(next, goal) >= goal.target) {
      next = decide(next, `goal|${goal.id}`, today, MILESTONE_REWARD, now);
    }
  }
  for (const debt of Object.values(data.debts)) {
    if (!debt.deleted && debtRemaining(next, debt) === 0) {
      next = decide(next, `debt|${debt.id}`, today, MILESTONE_REWARD, now);
    }
  }
  return next;
}

/**
 * Brings the money records up to date: adds due monthly items and settles any
 * rewards. Safe to call at any time; it returns the same save when nothing is due.
 */
export function housekeep(data: SaveData, today: DateStr, now: number): SaveData {
  if (!data.money) return data;
  const upToDate = addDueSubscriptions(addDueRecurring(data, today), today);
  return settleMilestones(settleBudgets(upToDate, today), today, now);
}
