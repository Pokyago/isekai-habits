import { describe, expect, it } from 'vitest';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { derive } from '../game/derive';
import * as money from './actions';
import type { TxInput } from './actions';
import { balance, budgetStatus, debtRemaining, goalSaved, monthSummary, perMonthNeeded } from './calc';
import { guessCategory } from './categories';
import { addMonths, amountText, dayInMonth, formatMoney, monthsBetween, parseAmount } from './format';
import { decodeBankFile, parseOfx, planImport } from './ofx';

const TODAY = '2026-11-20';

const start = (opening = 100000, budget: number | null = null): SaveData =>
  money.setupMoney(emptySave(), opening, budget, 'BRL', TODAY, 1);

const tx = (over: Partial<TxInput> = {}): TxInput => ({
  date: TODAY,
  kind: 'expense',
  amount: 2500,
  category: 'groceries',
  note: '',
  goalId: null,
  debtId: null,
  ...over,
});

const add = (d: SaveData, over: Partial<TxInput> = {}, today = TODAY, now = 10) =>
  money.saveTransaction(d, tx(over), undefined, today, now);

describe('amounts', () => {
  it('reads amounts typed the Brazilian way and the other way', () => {
    expect(parseAmount('12,50', 'BRL')).toBe(1250);
    expect(parseAmount('12.50', 'BRL')).toBe(1250);
    expect(parseAmount('1.234,56', 'BRL')).toBe(123456);
    expect(parseAmount('1.234', 'BRL')).toBe(123400);
    expect(parseAmount('R$ 40', 'BRL')).toBe(4000);
    expect(parseAmount('1,234.56', 'USD')).toBe(123456);
    expect(parseAmount('1,234', 'USD')).toBe(123400);
    expect(parseAmount('0,5', 'BRL')).toBe(50);
    expect(parseAmount('abc', 'BRL')).toBeNull();
    expect(parseAmount('', 'BRL')).toBeNull();
  });

  it('formats in the currency’s style', () => {
    expect(formatMoney(123456, 'BRL').replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(amountText(123456, 'BRL')).toBe('1234,56');
  });

  it('does month arithmetic', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(dayInMonth('2027-02', 31)).toBe('2027-02-28');
    expect(monthsBetween('2026-11', '2027-02')).toBe(3);
  });
});

describe('balance and months', () => {
  it('moves the balance with income and spending', () => {
    let d = start(100000);
    d = add(d, { amount: 2500 });
    d = add(d, { kind: 'income', amount: 50000, category: 'salary' });
    expect(balance(d, TODAY)).toBe(147500);
  });

  it('ignores transactions before the opening date and after the day asked about', () => {
    let d = start(100000);
    d = add(d, { date: '2026-11-10', amount: 9900 }); // already reflected in the opening balance
    d = add(d, { date: '2026-11-25', amount: 1000 }); // in the future
    expect(balance(d, TODAY)).toBe(100000);
    expect(balance(d, '2026-11-25')).toBe(99000);
    expect(monthSummary(d, '2026-11').spent).toBe(10900); // but both still count as November spending
  });

  it('sums a month by category, keeping debt and savings out of "spent"', () => {
    let d = start();
    d = add(d, { amount: 3000, category: 'groceries' });
    d = add(d, { amount: 1000, category: 'groceries' });
    d = add(d, { amount: 2000, category: 'fun' });
    d = add(d, { amount: 50000, category: 'debt' });
    d = add(d, { amount: 10000, category: 'savings' });
    d = add(d, { kind: 'income', amount: 300000, category: 'salary' });
    const s = monthSummary(d, '2026-11');
    expect(s).toMatchObject({ income: 300000, out: 66000, spent: 6000, count: 6 });
    expect(s.byCategory[0]).toEqual({ category: 'debt', amount: 50000 });
    expect(s.byCategory.find((c) => c.category === 'groceries')?.amount).toBe(4000);
  });

  it('corrects the balance with a single adjustment that is not spending', () => {
    let d = add(start(100000), { amount: 2500 });
    d = money.correctBalance(d, 90000, TODAY, 20);
    expect(balance(d, TODAY)).toBe(90000);
    expect(monthSummary(d, '2026-11').spent).toBe(2500);
    expect(money.correctBalance(d, 90000, TODAY, 21)).toBe(d); // already right: nothing added
  });

  it('removes a deleted transaction from the balance', () => {
    let d = add(start(100000), { amount: 2500 });
    const id = Object.keys(d.transactions)[0];
    d = money.deleteTransaction(d, id, 30);
    expect(balance(d, TODAY)).toBe(100000);
  });

  it('tracks what is left of the budget', () => {
    let d = start(100000, 110000);
    d = add(d, { amount: 55000 });
    expect(budgetStatus(d, TODAY)).toEqual({ budget: 110000, spent: 55000, left: 55000, daysLeft: 11, perDay: 5000 });
    expect(budgetStatus(start(), TODAY)).toBeNull();
  });
});

describe('rewards', () => {
  it('rewards logging once a day', () => {
    let d = add(start());
    d = add(d);
    expect(derive(d, TODAY)).toMatchObject({ heroXp: 5, gold: 3 });
    expect(derive(d, TODAY).stats.for.total).toBe(5);
    d = add(d, {}, '2026-11-21', 50);
    expect(derive(d, TODAY).heroXp).toBe(10);
  });

  it('does not reward editing', () => {
    let d = add(start());
    const id = Object.keys(d.transactions)[0];
    d = money.saveTransaction(d, tx({ amount: 9999 }), id, '2026-11-21', 60);
    expect(d.transactions[id].amount).toBe(9999);
    expect(derive(d, TODAY).heroXp).toBe(5);
  });

  it('judges a month against the budget once, after the grace days', () => {
    let d = add(start(100000, 50000), { amount: 20000 });
    expect(money.housekeep(d, '2026-12-03', 100).claims['budget|2026-11']).toBeUndefined();
    d = money.housekeep(d, '2026-12-04', 100);
    expect(d.claims['budget|2026-11']).toMatchObject({ claimed: true, xp: 50, gold: 30 });
    // Spending added to that month afterwards doesn't change the verdict.
    const late = money.housekeep(add(d, { date: '2026-11-30', amount: 90000 }, '2026-12-05', 110), '2026-12-05', 120);
    expect(late.claims['budget|2026-11'].claimed).toBe(true);
  });

  it('gives nothing for an overspent month, a month with no budget, or one with nothing logged', () => {
    const over = money.housekeep(add(start(100000, 10000), { amount: 20000 }), '2026-12-10', 100);
    expect(over.claims['budget|2026-11']).toMatchObject({ claimed: false, xp: 0 });
    const noBudget = money.housekeep(add(start()), '2026-12-10', 100);
    expect(noBudget.claims['budget|2026-11'].claimed).toBe(false);
    const empty = money.housekeep(start(100000, 10000), '2026-12-10', 100);
    expect(empty.claims['budget|2026-11'].claimed).toBe(false);
    // Setting a budget later doesn't reopen a month that was already judged.
    const later = money.housekeep(money.updateMoney(noBudget, { budget: 999999 }, 200), '2026-12-11', 210);
    expect(later.claims['budget|2026-11'].claimed).toBe(false);
  });
});

describe('debts and goals', () => {
  it('pays a debt down and rewards clearing it', () => {
    let d = money.saveDebt(start(), { name: 'Card', owed: 300000, targetDate: '2027-02-28' }, undefined, 5);
    const debt = Object.values(d.debts)[0];
    expect(perMonthNeeded(debtRemaining(d, debt), TODAY, debt.targetDate)).toBe(75000); // Nov, Dec, Jan, Feb
    d = add(d, { amount: 100000, category: 'debt', debtId: debt.id });
    expect(debtRemaining(d, debt)).toBe(200000);
    d = money.housekeep(d, TODAY, 20);
    expect(d.claims[`debt|${debt.id}`]).toBeUndefined();
    d = money.housekeep(add(d, { amount: 200000, category: 'debt', debtId: debt.id }), TODAY, 30);
    expect(debtRemaining(d, debt)).toBe(0);
    expect(d.claims[`debt|${debt.id}`]).toMatchObject({ claimed: true, xp: 100, gold: 50 });
    expect(derive(d, TODAY).achievements.find((a) => a.id === 'debt-slayer')?.earned).toBe(true);
  });

  it('counts money put towards a goal, and taken back out', () => {
    let d = money.saveGoal(start(), { name: 'Trip', target: 500000, saved: 100000, targetDate: null }, undefined, 5);
    const goal = Object.values(d.goals)[0];
    d = add(d, { amount: 50000, category: 'savings', goalId: goal.id });
    d = add(d, { kind: 'income', amount: 20000, category: 'other-income', goalId: goal.id });
    expect(goalSaved(d, goal)).toBe(130000);
    expect(perMonthNeeded(goal.target - goalSaved(d, goal), TODAY, null)).toBeNull();
    d = money.housekeep(money.saveGoal(d, { name: 'Trip', target: 500000, saved: 470000, targetDate: null }, goal.id, 40), TODAY, 50);
    expect(d.claims[`goal|${goal.id}`]?.claimed).toBe(true);
  });
});

describe('recurring items', () => {
  const rent = { name: 'Rent', kind: 'expense' as const, amount: 150000, category: 'housing', day: 5, startMonth: '2026-12', endMonth: null, goalId: null, debtId: null };

  it('adds each month’s item once it is due, and only once', () => {
    let d = money.saveRecurring(start(500000), rent, undefined, 5);
    expect(Object.keys(money.housekeep(d, '2026-12-04', 10).transactions).length).toBe(0);
    d = money.housekeep(d, '2026-12-05', 10);
    d = money.housekeep(d, '2026-12-06', 11);
    expect(Object.values(d.transactions).map((t) => t.date)).toEqual(['2026-12-05']);
    d = money.housekeep(d, '2027-02-10', 12);
    expect(Object.values(d.transactions).map((t) => t.date).sort()).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);
    expect(balance(d, '2027-02-10')).toBe(50000);
  });

  it('stops at the end month, uses the last day of short months, and stays deleted', () => {
    const item = { ...rent, day: 31, startMonth: '2027-01', endMonth: '2027-02' };
    let d = money.housekeep(money.saveRecurring(start(), item, undefined, 5), '2027-06-01', 10);
    expect(Object.values(d.transactions).map((t) => t.date).sort()).toEqual(['2027-01-31', '2027-02-28']);
    const id = Object.keys(d.transactions)[0];
    d = money.housekeep(money.deleteTransaction(d, id, 20), '2027-06-02', 30);
    expect(Object.values(d.transactions).filter((t) => !t.deleted).length).toBe(1);
  });

  it('creates identical records on two devices', () => {
    const base = money.saveRecurring(start(), rent, undefined, 5);
    const pc = money.housekeep(base, '2026-12-05', 1000);
    const ipad = money.housekeep(base, '2026-12-09', 999999);
    expect(sameSave(pc, ipad)).toBe(true);
    expect(Object.keys(mergeSaves(pc, ipad).transactions).length).toBe(1);
  });

  it('pays down a linked debt automatically', () => {
    let d = money.saveDebt(start(), { name: 'Loan', owed: 200000, targetDate: null }, undefined, 5);
    const debt = Object.values(d.debts)[0];
    d = money.saveRecurring(d, { ...rent, name: 'Loan instalment', amount: 100000, category: 'debt', debtId: debt.id }, undefined, 6);
    d = money.housekeep(d, '2027-01-05', 10);
    expect(debtRemaining(d, debt)).toBe(0);
    expect(d.claims[`debt|${debt.id}`]?.claimed).toBe(true);
  });
});

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<DTSTART>20261101000000[-3:BRT]
<DTEND>20261120000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261118100000[-3:BRT]
<TRNAMT>-45.90
<FITID>202611180001
<MEMO>IFOOD *RESTAURANTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261119
<TRNAMT>3500,00
<FITID>202611190001
<MEMO>PAGAMENTO DE SALARIO
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261120<TRNAMT>-25.00<FITID>202611200001<NAME>UBER<MEMO>UBER *TRIP</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261120<TRNAMT>-25.00<FITID>202611200001<NAME>UBER<MEMO>UBER *TRIP</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4321.09
<DTASOF>20261120000000[-3:BRT]
</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('bank statement import', () => {
  it('reads movements and the closing balance from an OFX file', () => {
    const s = parseOfx(OFX);
    expect(s.entries.length).toBe(4);
    expect(s.entries[0]).toEqual({ date: '2026-11-18', amount: -4590, fitid: '202611180001', memo: 'IFOOD *RESTAURANTE' });
    expect(s.entries[1].amount).toBe(350000);
    expect(s.entries[2].memo).toBe('UBER · UBER *TRIP');
    expect(s.balance).toEqual({ amount: 432109, date: '2026-11-20' });
    expect(() => parseOfx('date,amount\n1,2')).toThrow();
  });

  it('decodes Windows-1252 and UTF-8 files', () => {
    const latin = new Uint8Array([...'CHARSET:1252\n<MEMO>PADARIA P'].map((c) => c.charCodeAt(0)).concat([0xc3, 0x4f])); // PÃO
    expect(decodeBankFile(latin)).toContain('PÃO');
    expect(decodeBankFile(new TextEncoder().encode('ENCODING:UTF-8\n<MEMO>PÃO'))).toContain('PÃO');
    expect(decodeBankFile(new TextEncoder().encode('<MEMO>AÇAÍ'))).toContain('AÇAÍ');
  });

  it('guesses categories from the description', () => {
    expect(guessCategory('IFOOD *RESTAURANTE', 'expense')).toBe('eating');
    expect(guessCategory('UBER *TRIP', 'expense')).toBe('transport');
    expect(guessCategory('PAGAMENTO DE SALARIO', 'income')).toBe('salary');
    expect(guessCategory('LOJA XYZ', 'expense')).toBe('other');
  });

  it('imports once, spots what was already typed in, and keeps identical movements apart', () => {
    let d = add(start(), { date: '2026-11-17', amount: 4590, category: 'eating' }); // typed in the day before it posted
    const plan = planImport(d, parseOfx(OFX));
    expect(plan.map((r) => r.status)).toEqual(['logged', 'new', 'new', 'new']);
    expect(new Set(plan.map((r) => r.id)).size).toBe(4);
    expect(plan[1]).toMatchObject({ kind: 'income', amount: 350000, category: 'salary' });

    d = money.importRows(d, plan.filter((r) => r.status === 'new'), TODAY, 50);
    expect(Object.keys(d.transactions).length).toBe(4);
    expect(planImport(d, parseOfx(OFX)).map((r) => r.status)).toEqual(['logged', 'imported', 'imported', 'imported']);
    const again = planImport(d, parseOfx(OFX)).filter((r) => r.status !== 'logged');
    expect(money.importRows(d, again, TODAY, 60)).toBe(d);
  });

  it('does not bring back an imported movement the user deleted', () => {
    let d = money.importRows(start(), planImport(start(), parseOfx(OFX)), TODAY, 50);
    const id = Object.keys(d.transactions)[0];
    d = money.deleteTransaction(d, id, 60);
    d = money.importRows(d, planImport(d, parseOfx(OFX)), TODAY, 70);
    expect(d.transactions[id].deleted).toBe(true);
  });
});

describe('saving and merging', () => {
  it('keeps money records through the save file and merges both devices’ entries', () => {
    const base = start(100000, 50000);
    const pc = add(base, { amount: 1000 }, TODAY, 100);
    const ipad = add(base, { amount: 2000 }, TODAY, 200);
    const merged = mergeSaves(pc, ipad);
    expect(sameSave(merged, mergeSaves(ipad, pc))).toBe(true);
    expect(balance(merged, TODAY)).toBe(97000);
    expect(derive(merged, TODAY).heroXp).toBe(5); // one logging reward for the day, not two
    expect(sameSave(parseSave(serializeSave(merged)), merged)).toBe(true);
  });

  it('opens a save from before money tracking, and refuses one from a newer app', () => {
    const old = JSON.stringify({ version: 1, hero: null, habits: {}, completions: {}, quests: {}, claims: {}, rewards: {}, purchases: {} });
    expect(parseSave(old)).toEqual(emptySave());
    expect(() => parseSave(JSON.stringify({ version: 3 }))).toThrow(/newer version/);
  });
});
