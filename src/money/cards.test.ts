import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { weekReview } from '../game/review';
import { moneyDue } from '../plan/plan';
import * as money from './actions';
import { addPurchase, deleteCard, deletePlan, payBill, saveCard } from './cardActions';
import { activeCards, billDates, billFor, billOf, billsToPay, cardSummary, cardsOwed, instalments } from './cards';
import { balance, budgetStatus, monthSummary } from './calc';
import { planImport } from './statement';
import { balanceSeries, categoryTotals } from './trends';

const TODAY = '2026-11-20';
const T0 = Date.parse('2026-11-01T09:00:00');

/** Money set up with R$ 5.000 in the bank and a card that closes on the 3rd and is due on the 10th. */
function start(closingDay = 3, dueDay = 10): { d: SaveData; card: string } {
  let d = actions.createHero(emptySave(), 'Tester', 'mage', [], '2026-11-01', T0);
  d = money.setupMoney(d, 500_000, 300_000, 'BRL', '2026-11-01', T0);
  d = saveCard(d, { name: 'Itaú', closingDay, dueDay, limit: 1_000_000 }, undefined, T0);
  return { d, card: Object.keys(d.cards)[0] };
}

const buy = (d: SaveData, cardId: string, date: string, amount: number, parts = 1, category = 'shopping', note = '') =>
  addPurchase(d, { cardId, date, amount, category, note, parts }, TODAY, T0 + 10);
const cardOf = (d: SaveData) => activeCards(d)[0];

describe('which bill a purchase goes on', () => {
  it('closes the same month it is due when the closing day comes first', () => {
    const card = { closingDay: 3, dueDay: 10 };
    expect(billDates(card, '2026-12')).toEqual({ closes: '2026-12-03', due: '2026-12-10' });
    expect(billFor(card, '2026-11-20')).toBe('2026-12');
    // The day before closing is the last day on a bill; the closing day itself is the first of the next.
    expect(billFor(card, '2026-12-02')).toBe('2026-12');
    expect(billFor(card, '2026-12-03')).toBe('2027-01');
  });

  it('closes the month before when the closing day comes after the due day', () => {
    const card = { closingDay: 28, dueDay: 5 };
    expect(billDates(card, '2026-12')).toEqual({ closes: '2026-11-28', due: '2026-12-05' });
    expect(billFor(card, '2026-11-20')).toBe('2026-12');
    expect(billFor(card, '2026-11-28')).toBe('2027-01');
    // A closing day a short month doesn't have falls on its last day.
    expect(billDates({ closingDay: 31, dueDay: 8 }, '2027-03').closes).toBe('2027-02-28');
  });
});

describe('buying on the card', () => {
  it('is spending now, and leaves the bank balance alone', () => {
    const s = start();
    const d = buy(s.d, s.card, TODAY, 20_000);
    expect(balance(d, TODAY)).toBe(500_000);
    expect(balanceSeries(d, '2026-11-01', TODAY).at(-1)!.amount).toBe(500_000);

    const month = monthSummary(d, '2026-11');
    expect(month).toMatchObject({ out: 0, spent: 20_000, onCard: 20_000 });
    expect(month.byCategory).toEqual([{ category: 'shopping', amount: 20_000 }]);
    expect(budgetStatus(d, TODAY)).toMatchObject({ spent: 20_000, left: 280_000 });
    expect(weekReview(d, TODAY, TODAY).money).toEqual({ spent: 20_000, income: 0 });
    // The first thing recorded in a day earns the usual small reward.
    expect(d.claims[`ledger|${TODAY}`]?.claimed).toBe(true);
  });

  it('goes on the open bill and shows in what is owed', () => {
    const s = start();
    let d = buy(s.d, s.card, '2026-11-05', 10_000);
    d = buy(d, s.card, TODAY, 20_000);
    const sum = cardSummary(d, cardOf(d), TODAY);
    expect(sum.open).toMatchObject({ month: '2026-12', total: 30_000, left: 30_000, status: 'open', closes: '2026-12-03', due: '2026-12-10' });
    expect(sum.open.purchases.map((p) => p.amount)).toEqual([10_000, 20_000]);
    expect(sum).toMatchObject({ owedNow: 30_000, later: 0, owed: 30_000, toPay: [] });
    expect(cardsOwed(d, TODAY)).toEqual({ now: 30_000, later: 0 });
  });

  it('splits a purchase in instalments over the following bills and months', () => {
    expect(instalments(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(instalments(100_000, 1)).toEqual([100_000]);

    const s = start();
    const d = buy(s.d, s.card, TODAY, 60_000, 6, 'shopping', 'New phone');
    const parts = Object.values(d.transactions).sort((a, b) => (a.date < b.date ? -1 : 1));
    expect(parts.map((p) => [p.date, p.bill, p.amount, p.plan?.part, p.plan?.of])).toEqual([
      ['2026-11-20', '2026-12', 10_000, 1, 6],
      ['2026-12-20', '2027-01', 10_000, 2, 6],
      ['2027-01-20', '2027-02', 10_000, 3, 6],
      ['2027-02-20', '2027-03', 10_000, 4, 6],
      ['2027-03-20', '2027-04', 10_000, 5, 6],
      ['2027-04-20', '2027-05', 10_000, 6, 6],
    ]);
    // Only this month's part counts against this month's budget.
    expect(monthSummary(d, '2026-11').spent).toBe(10_000);
    expect(monthSummary(d, '2026-12').spent).toBe(10_000);
    expect(cardSummary(d, cardOf(d), TODAY)).toMatchObject({ owedNow: 10_000, later: 50_000, owed: 60_000 });

    // Removing the purchase removes every part.
    const gone = deletePlan(d, parts[0].plan!.id, T0 + 20);
    expect(cardSummary(gone, cardOf(gone), TODAY).owed).toBe(0);
  });

  it('can be put on another bill by hand', () => {
    const s = start();
    const d = addPurchase(s.d, { cardId: s.card, date: TODAY, amount: 5_000, category: 'eating', note: '', parts: 1, bill: '2027-01' }, TODAY, T0 + 10);
    expect(Object.values(d.transactions)[0].bill).toBe('2027-01');
  });
});

describe('paying the bill', () => {
  it('takes the money from the bank, and is not spending a second time', () => {
    const s = start();
    let d = buy(s.d, s.card, '2026-11-05', 30_000);
    // The bill closed on December 3rd; it is paid on the 9th.
    const on = '2026-12-09';
    expect(billOf(d, cardOf(d), '2026-12', on).status).toBe('closed');
    expect(billsToPay(d, on).map((b) => [b.month, b.left])).toEqual([['2026-12', 30_000]]);
    expect(moneyDue(d, '2026-12-10')).toEqual([expect.objectContaining({ name: 'Itaú bill', amount: 30_000, kind: 'expense' })]);

    d = payBill(d, s.card, '2026-12', 30_000, on, on, T0 + 30);
    expect(balance(d, on)).toBe(470_000);
    expect(billOf(d, cardOf(d), '2026-12', on)).toMatchObject({ paid: 30_000, left: 0, status: 'paid' });
    expect(billsToPay(d, on)).toEqual([]);
    expect(moneyDue(d, '2026-12-10')).toEqual([]);

    // November: spent on the card. December: the money left, nothing was spent.
    expect(monthSummary(d, '2026-11')).toMatchObject({ out: 0, spent: 30_000 });
    expect(monthSummary(d, '2026-12')).toMatchObject({ out: 30_000, spent: 0, byCategory: [] });
    expect(categoryTotals(d, ['2026-11', '2026-12'])).toEqual([{ category: 'shopping', total: 30_000 }]);
  });

  it('puts what was not written down on the bill, so the spending still counts', () => {
    const s = start();
    let d = buy(s.d, s.card, '2026-11-05', 30_000);
    d = payBill(d, s.card, '2026-12', 45_000, '2026-12-09', '2026-12-09', T0 + 30);
    const bill = billOf(d, cardOf(d), '2026-12', '2026-12-09');
    expect(bill).toMatchObject({ total: 45_000, paid: 45_000, left: 0, status: 'paid' });
    const extra = bill.purchases.find((p) => p.note === 'Not itemised')!;
    // Dated the last day the bill took purchases.
    expect(extra).toMatchObject({ amount: 15_000, date: '2026-12-02', category: 'card', bill: '2026-12' });
    expect(balance(d, '2026-12-09')).toBe(455_000);
    expect(monthSummary(d, '2026-12')).toMatchObject({ out: 45_000, spent: 15_000 });
  });

  it('leaves the rest owed when only part is paid, and turns overdue after the due date', () => {
    const s = start();
    let d = buy(s.d, s.card, '2026-11-05', 30_000);
    d = payBill(d, s.card, '2026-12', 10_000, '2026-12-09', '2026-12-09', T0 + 30);
    expect(billOf(d, cardOf(d), '2026-12', '2026-12-10')).toMatchObject({ left: 20_000, status: 'closed' });
    expect(billOf(d, cardOf(d), '2026-12', '2026-12-11')).toMatchObject({ left: 20_000, status: 'overdue' });
    expect(cardsOwed(d, '2026-12-11').now).toBe(20_000);
  });
});

describe('editing and other records', () => {
  it('keeps a card purchase on its card when it is edited, and can move it to the bank', () => {
    const s = start();
    let d = buy(s.d, s.card, TODAY, 20_000);
    const id = Object.keys(d.transactions)[0];
    const input = { date: TODAY, kind: 'expense' as const, amount: 25_000, category: 'eating', note: 'Dinner', goalId: null, debtId: null };

    d = money.saveTransaction(d, { ...input, cardId: s.card, bill: '2027-01' }, id, TODAY, T0 + 40);
    expect(d.transactions[id]).toMatchObject({ amount: 25_000, cardId: s.card, bill: '2027-01' });
    expect(balance(d, TODAY)).toBe(500_000);

    d = money.saveTransaction(d, { ...input, cardId: null }, id, TODAY, T0 + 50);
    expect(d.transactions[id].cardId).toBeUndefined();
    expect(d.transactions[id].bill).toBeUndefined();
    expect(balance(d, TODAY)).toBe(475_000);
  });

  it('lets an entry from the bank statement be marked as the bill’s payment', () => {
    const s = start();
    let d = buy(s.d, s.card, '2026-11-05', 30_000);
    const row = { date: '2026-12-09', kind: 'expense' as const, amount: 30_000, category: 'card', note: 'FATURA ITAU', goalId: null, debtId: null };
    d = money.saveTransaction(d, row, undefined, '2026-12-09', T0 + 60);
    const id = Object.values(d.transactions).find((t) => t.note === 'FATURA ITAU')!.id;
    // Unmarked, it would count as spending again.
    expect(monthSummary(d, '2026-12').spent).toBe(30_000);
    d = money.saveTransaction(d, { ...row, paysBill: `${s.card}|2026-12` }, id, '2026-12-09', T0 + 70);
    expect(monthSummary(d, '2026-12').spent).toBe(0);
    expect(billOf(d, cardOf(d), '2026-12', '2026-12-09').status).toBe('paid');
  });

  it('never takes a card purchase for a row of the bank statement', () => {
    const s = start();
    const d = buy(s.d, s.card, TODAY, 20_000);
    const rows = planImport(d, { format: 'OFX', entries: [{ date: TODAY, amount: -20_000, memo: 'PIX', key: 'a' }] } as never);
    expect(rows.map((r) => r.status)).toEqual(['new']);
  });

  it('keeps the spending when a card is removed, survives the save file, and merges', () => {
    const s = start();
    const d = buy(s.d, s.card, TODAY, 20_000, 2);
    const back = parseSave(serializeSave(d));
    expect(sameSave(back, d)).toBe(true);
    expect(cardSummary(back, cardOf(back), TODAY).owed).toBe(20_000);

    const old = JSON.parse(serializeSave(actions.createHero(emptySave(), 'Tester', 'mage', [], TODAY, T0)));
    delete old.cards;
    old.version = 9;
    expect(parseSave(JSON.stringify(old))).toMatchObject({ version: 10, cards: {} });

    const removed = deleteCard(d, s.card, T0 + 80);
    expect(activeCards(removed)).toEqual([]);
    expect(cardsOwed(removed, TODAY)).toEqual({ now: 0, later: 0 });
    expect(monthSummary(removed, '2026-11').spent).toBe(10_000);
    expect(balance(removed, TODAY)).toBe(500_000);

    const other = buy(s.d, s.card, TODAY, 7_000);
    const merged = mergeSaves(d, other);
    expect(sameSave(merged, mergeSaves(other, d))).toBe(true);
    expect(cardSummary(merged, cardOf(merged), TODAY).owed).toBe(27_000);
  });
});
