import { describe, expect, it } from 'vitest';
import { emptySave, mergeSaves, parseSave, sameSave, serializeSave } from '../data/merge';
import type { SaveData } from '../data/types';
import { derive } from '../game/derive';
import * as money from './actions';
import type { TxInput } from './actions';
import { balance, budgetStatus, debtRemaining, goalSaved, monthSummary, perMonthNeeded } from './calc';
import { guessCategory } from './categories';
import { addMonths, amountText, dayInMonth, formatMoney, monthsBetween, parseAmount } from './format';
import { isItauStatement, parseItau, type PdfLine } from './itau';
import { decodeBankFile, parseOfx } from './ofx';
import { groupLines } from './pdfLines';
import { planImport } from './statement';
import { nextCharge, subscriptionTotals, upcomingCharges } from './subscriptions';
import { balanceSeries, categoryByMonth, categoryTotals, firstMonthWithEntries, lastMonths, monthlyFlows } from './trends';
import { daysBetween as daysBetweenDates } from '../game/dates';

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
    expect(s.entries[0]).toEqual({ date: '2026-11-18', amount: -4590, key: '202611180001', memo: 'IFOOD *RESTAURANTE' });
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
    expect(guessCategory('STEAM PURCHASE', 'expense')).toBe('games');
    expect(guessCategory('NUUVEM GAMES', 'expense')).toBe('games');
    expect(guessCategory('AMAZON KINDLE', 'expense')).toBe('books');
    expect(guessCategory('LIVRARIA CULTURA', 'expense')).toBe('books');
    expect(guessCategory('PANINI MANGA', 'expense')).toBe('books');
    expect(guessCategory('AMAZON MARKETPLACE', 'expense')).toBe('shopping');
    expect(guessCategory('FACEBOOK ADS', 'expense')).toBe('other'); // "book" inside another word
    expect(guessCategory('CINEMA SHOPPING', 'expense')).toBe('fun');
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

// A made-up statement in the Itaú PDF layout: text items at the x positions the real one uses.
const COLS = { date: 39.7, kind: 99.9, desc: 256.2, value: 466.7, balance: 551.7 };
const header: PdfLine = {
  items: [
    { x: 39.7, w: 24, text: 'Data' },
    { x: 99.9, w: 69, text: 'Lançamentos' },
    { x: 256.2, w: 51, text: 'Descrição' },
    { x: 416.3, w: 50, text: 'Valor (R$)' },
    { x: 500.1, w: 52, text: 'Saldo (R$)' },
  ],
};
const one = (text: string, x = 39.7): PdfLine => ({ items: [{ x, w: text.length * 5.5, text }] });
/** Amounts are right-aligned: where they start depends on how wide they are. */
const amount = (text: string, right: number) => ({ x: right - text.length * 5.6, w: text.length * 5.6, text });
const row = (date: string, kind: string, desc: string, value: string): PdfLine => ({
  items: [
    { x: COLS.date, w: 48, text: date },
    { x: COLS.kind, w: kind.length * 6, text: kind },
    { x: COLS.desc, w: desc.length * 6, text: desc },
    amount(value, COLS.value),
  ],
});
const closing = (date: string, value: string): PdfLine => ({
  items: [{ x: COLS.date, w: 48, text: date }, amount(value, COLS.balance)],
});
const wrap = (kind: string | null, desc: string | null): PdfLine => ({
  items: [
    ...(kind ? [{ x: COLS.kind, w: kind.length * 6, text: kind }] : []),
    ...(desc ? [{ x: COLS.desc, w: desc.length * 6, text: desc }] : []),
  ],
});

const ITAU: PdfLine[] = [
  one('FULANO DE TAL', 400),
  one('Saldo em conta'),
  one('R$ 1.234,56'),
  one('Extrato conta corrente'),
  {
    items: [
      { x: 39.7, w: 229, text: 'Período de visualização: 01/10/2026 até 20/11/2026' },
      { x: 411, w: 145, text: 'Emitido em: 20/11/2026 00:08:21' },
    ],
  },
  one('Lançamentos futuros'),
  one('Saídas futuras'),
  header,
  row('23/11/2026', 'DÉBITO AUTOMÁTICO', 'DA OPERADORA 123', '-99,90'),
  one('Lançamentos'),
  header,
  row('19/11/2026', 'SALÁRIO', 'EMPRESA EXEMPLO', '5.000,00'),
  wrap(null, 'CONSULTORIA LTDA'),
  closing('18/11/2026', '1.234,54'),
  row('18/11/2026', 'PIX ENVIADO', 'MARIA DA SILVA', '-50,00'),
  header, // a new page repeats the header
  closing('17/11/2026', '1.284,54'),
  row('17/11/2026', 'PAGAMENTO DE PIX QR', 'IFOOD.COM AGENCIA DE', '-60,00'),
  wrap('CODE', 'RESTAURANTES ONLINE'),
  wrap(null, 'S.A.'),
  row('17/11/2026', 'PAGAMENTO DE FATURA', 'FATURA PAGA', '-9.000,00'),
  row('17/11/2026', 'RENDIMENTOS', 'REND PAGO APLIC AUT', '0,01'),
  row('16/11/2026', 'PIX ENVIADO', 'PIX ENVIADO', '-200,00'),
  row('16/11/2026', 'PIX ENVIADO', 'PIX ENVIADO', '-200,00'),
  closing('13/11/2026', '10.744,53'),
  row('13/11/2026', 'SAÍDA', 'CEEE 000000000000', '-300,00'),
  closing('30/10/2026', '11.044,53'),
  one('Posição consolidada'),
  { items: [{ x: 39.7, w: 50, text: 'Descrição' }, { x: 480, w: 30, text: 'Valor' }] },
  { items: [{ x: 39.7, w: 200, text: 'saldo disponível' }, amount('R$ 1.234,56', 551.7)] },
];

describe('Itaú PDF statement', () => {
  it('reads movements, wrapped text and the headline balance, and skips future items', () => {
    expect(isItauStatement(ITAU)).toBe(true);
    const s = parseItau(ITAU);
    expect(s.format).toBe('Itaú PDF');
    expect(s.balance).toEqual({ amount: 123456, date: '2026-11-20' });
    expect(s.entries.map((e) => [e.date, e.amount, e.memo])).toEqual([
      ['2026-11-19', 500000, 'EMPRESA EXEMPLO CONSULTORIA LTDA'],
      ['2026-11-18', -5000, 'MARIA DA SILVA'],
      ['2026-11-17', -6000, 'IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.'],
      ['2026-11-17', -900000, 'FATURA PAGA'],
      ['2026-11-17', 1, 'REND PAGO APLIC AUT'],
      ['2026-11-16', -20000, 'PIX ENVIADO'],
      ['2026-11-16', -20000, 'PIX ENVIADO'],
      ['2026-11-13', -30000, 'CEEE 000000000000'],
    ]);
    expect(s.entries[2].hint).toBe('PAGAMENTO DE PIX QR CODE');
  });

  it('checks the rows against the daily balances printed in the statement', () => {
    expect(parseItau(ITAU).checks).toEqual({ total: 3, failed: 0 });
    // Lose one row and the balances no longer add up.
    const broken = ITAU.filter((l) => !l.items.some((i) => i.text === 'MARIA DA SILVA'));
    expect(parseItau(broken).checks).toEqual({ total: 3, failed: 1 });
  });

  it('accepts overdrawn days, whose balance is printed without a minus sign', () => {
    const overdrawn: PdfLine[] = [
      one('Extrato conta corrente'),
      one('Lançamentos'),
      header,
      closing('15/10/2026', '1.000,00'),
      row('15/10/2026', 'SALÁRIO', 'EMPRESA EXEMPLO', '1.070,00'),
      closing('13/10/2026', '70,00'), // really −70,00
      row('13/10/2026', 'SAÍDA', 'SEGURO', '-20,00'),
      closing('09/10/2026', '50,00'), // really −50,00
      row('09/10/2026', 'PIX ENVIADO', 'MARIA DA SILVA', '-150,00'),
      closing('05/10/2026', '100,00'),
    ];
    expect(parseItau(overdrawn).checks).toEqual({ total: 3, failed: 0 });
  });

  it('copes with the date and the kind arriving as one piece of text', () => {
    const merged = ITAU.map((l) => {
      const [date, kind, ...rest] = l.items;
      if (!kind || !/^\d{2}\/\d{2}\/\d{4}$/.test(date.text) || kind.x > 200) return l;
      return { items: [{ x: date.x, w: date.w + 12 + kind.w, text: `${date.text} ${kind.text}` }, ...rest] };
    });
    const s = parseItau(merged);
    expect(s.entries.length).toBe(8);
    expect(s.entries[0]).toMatchObject({ date: '2026-11-19', amount: 500000, hint: 'SALÁRIO' });
    expect(s.checks).toEqual({ total: 3, failed: 0 });
  });

  it('guesses categories from the kind of movement as well as the description', () => {
    const rows = planImport(start(), parseItau(ITAU));
    expect(rows.map((r) => r.category)).toEqual(['salary', 'other', 'eating', 'card', 'interest', 'other', 'other', 'bills']);
    expect(rows.map((r) => r.kind)).toEqual(['income', 'expense', 'expense', 'expense', 'income', 'expense', 'expense', 'expense']);
  });

  it('keeps two identical movements on the same day apart, and imports only once', () => {
    let d = start();
    const rows = planImport(d, parseItau(ITAU));
    expect(new Set(rows.map((r) => r.id)).size).toBe(8);
    d = money.importRows(d, rows, TODAY, 50);
    expect(planImport(d, parseItau(ITAU)).every((r) => r.status === 'imported')).toBe(true);
  });

  it('spots movements already imported from a different kind of file', () => {
    const ofx = '<OFX><STMTTRN><DTPOSTED>20261118<TRNAMT>-50.00<FITID>X1<MEMO>PIX MARIA</STMTTRN></OFX>';
    const d = money.importRows(start(), planImport(start(), parseOfx(ofx)), TODAY, 50);
    const rows = planImport(d, parseItau(ITAU));
    expect(rows.find((r) => r.note === 'MARIA DA SILVA')?.status).toBe('logged');
    expect(rows.filter((r) => r.status === 'new').length).toBe(7);
  });

  it('rejects PDFs in another layout', () => {
    expect(isItauStatement([one('Some other document')])).toBe(false);
    expect(() => parseItau([one('Some other document')])).toThrow();
  });

  it('rebuilds lines from scattered text, tolerating slightly different baselines', () => {
    const lines = groupLines([
      { page: 2, x: 39.7, y: 700, w: 48, text: 'page two' },
      { page: 1, x: 434.7, y: 73.2, w: 32, text: '-50,00' },
      { page: 1, x: 39.7, y: 73.9, w: 48, text: '18/11/2026' },
      { page: 1, x: 99.9, y: 72.4, w: 66, text: 'PIX ENVIADO' },
      { page: 1, x: 256.2, y: 122.7, w: 101, text: 'line above' },
    ]);
    expect(lines.map((l) => l.items.map((i) => i.text))).toEqual([['line above'], ['18/11/2026', 'PIX ENVIADO', '-50,00'], ['page two']]);
  });
});

describe('subscriptions', () => {
  const sub = (over: Partial<money.SubscriptionInput> = {}): money.SubscriptionInput => ({
    name: 'Streaming',
    amount: 5590,
    cycle: 'monthly',
    anchor: '2026-11-25',
    paidWith: 'card',
    active: true,
    note: '',
    ...over,
  });
  const addSub = (d: SaveData, over: Partial<money.SubscriptionInput> = {}, now = 5) =>
    money.saveSubscription(d, sub(over), undefined, TODAY, now);

  it('finds the next charge date for monthly and yearly cycles', () => {
    const monthly = { anchor: '2026-01-31', cycle: 'monthly' as const };
    expect(nextCharge(monthly, '2026-01-01')).toBe('2026-01-31'); // nothing before the first charge
    expect(nextCharge(monthly, '2026-02-01')).toBe('2026-02-28'); // short month: its last day
    expect(nextCharge(monthly, '2026-02-28')).toBe('2026-02-28');
    expect(nextCharge(monthly, '2026-03-01')).toBe('2026-03-31');
    const yearly = { anchor: '2026-03-15', cycle: 'yearly' as const };
    expect(nextCharge(yearly, TODAY)).toBe('2027-03-15');
    expect(nextCharge(yearly, '2027-03-15')).toBe('2027-03-15');
    expect(nextCharge(yearly, '2027-03-16')).toBe('2028-03-15');
  });

  it('adds up what they cost per month and per year, leaving out cancelled ones', () => {
    let d = addSub(start(), { amount: 5590 });
    d = addSub(d, { name: 'Cloud storage', amount: 1290, paidWith: 'bank' }, 6);
    d = addSub(d, { name: 'Domain', amount: 12000, cycle: 'yearly', anchor: '2027-03-15' }, 7);
    d = addSub(d, { name: 'Old gym', amount: 9900, active: false }, 8);
    expect(subscriptionTotals(d)).toEqual({ count: 3, perMonth: 7880, perYear: 94560, onCard: 6590, fromBank: 1290 });
    expect(upcomingCharges(d, TODAY).map((u) => [u.sub.name, u.date])).toEqual([
      ['Cloud storage', '2026-11-25'],
      ['Streaming', '2026-11-25'],
      ['Domain', '2027-03-15'],
    ]);
  });

  it('adds an entry for each charge paid from the bank, and none for ones on the card', () => {
    let d = addSub(start(100000), { name: 'On card' });
    d = addSub(d, { name: 'From bank', amount: 2000, paidWith: 'bank' }, 6);
    expect(Object.keys(money.housekeep(d, '2026-11-24', 10).transactions).length).toBe(0);
    d = money.housekeep(d, '2027-01-26', 10);
    const entries = Object.values(d.transactions);
    expect(entries.map((t) => t.date).sort()).toEqual(['2026-11-25', '2026-12-25', '2027-01-25']);
    expect(entries.every((t) => t.note === 'From bank' && t.category === 'subscriptions' && t.kind === 'expense')).toBe(true);
    expect(balance(d, '2027-01-26')).toBe(94000);
    expect(money.housekeep(d, '2027-01-27', 11)).toBe(d); // nothing new the next day
  });

  it('charges a yearly one once a year, and nothing from before it was added', () => {
    // The date given is last year's charge: the next one is what counts.
    let d = addSub(start(100000), { name: 'Yearly', amount: 30000, cycle: 'yearly', anchor: '2026-02-10', paidWith: 'bank' });
    expect(Object.keys(money.housekeep(d, '2027-02-09', 10).transactions).length).toBe(0);
    d = money.housekeep(d, '2028-06-01', 10);
    expect(Object.values(d.transactions).map((t) => t.date).sort()).toEqual(['2027-02-10', '2028-02-10']);
  });

  it('stops charging when cancelled or deleted, and a deleted entry stays deleted', () => {
    let d = addSub(start(), { paidWith: 'bank' });
    const id = Object.keys(d.subscriptions)[0];
    d = money.housekeep(d, '2026-11-25', 10);
    const entry = Object.keys(d.transactions)[0];
    d = money.deleteTransaction(d, entry, 20);
    d = money.saveSubscription(d, sub({ paidWith: 'bank', active: false }), id, '2026-11-26', 30);
    d = money.housekeep(d, '2027-03-01', 40);
    expect(Object.values(d.transactions).filter((t) => !t.deleted).length).toBe(0);
    expect(d.subscriptions[id].since).toBe(TODAY); // editing keeps the day it was added
    expect(subscriptionTotals(money.deleteSubscription(d, id, 50)).count).toBe(0);
  });

  it('creates the same entry on two devices', () => {
    const base = addSub(start(), { paidWith: 'bank' });
    const pc = money.housekeep(base, '2026-11-25', 1000);
    const ipad = money.housekeep(base, '2026-11-30', 999999);
    expect(sameSave(pc, ipad)).toBe(true);
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
    expect(parseSave(JSON.stringify({ version: 2, money: null, transactions: {} }))).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ version: 3, subscriptions: {} }))).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ version: 4, health: {} }))).toEqual(emptySave());
    expect(() => parseSave(JSON.stringify({ version: 6 }))).toThrow(/newer version/);
  });
});

describe('money trends', () => {
  it('follows the balance day by day from the opening date', () => {
    let d = start(100000); // opens on 2026-11-20
    d = add(d, { date: '2026-11-21', amount: 2500 }, '2026-11-23');
    d = add(d, { date: '2026-11-23', kind: 'income', amount: 10000, category: 'salary' }, '2026-11-23', 11);
    d = add(d, { date: '2026-11-10', amount: 99900 }, '2026-11-23', 12); // before the opening date: not in the balance
    expect(balanceSeries(d, '2026-11-01', '2026-11-23')).toEqual([
      { date: '2026-11-20', amount: 100000 },
      { date: '2026-11-21', amount: 97500 },
      { date: '2026-11-22', amount: 97500 },
      { date: '2026-11-23', amount: 107500 },
    ]);
    // A window that starts later begins from the balance already reached.
    expect(balanceSeries(d, '2026-11-22', '2026-11-23')[0]).toEqual({ date: '2026-11-22', amount: 97500 });
    expect(balanceSeries(emptySave(), '2026-11-01', '2026-11-23')).toEqual([]);
  });

  it('thins a long balance history to weekly points but keeps today', () => {
    const d = start(100000);
    const series = balanceSeries(d, '2026-11-20', '2028-06-30');
    expect(series.length).toBeLessThan(100);
    expect(series[series.length - 1].date).toBe('2028-06-30');
    expect(daysBetweenDates(series[0].date, series[1].date)).toBe(7);
  });

  it('adds up each month, including months from before the opening date', () => {
    let d = start();
    d = add(d, { date: '2026-09-10', amount: 30000, category: 'games' });
    d = add(d, { date: '2026-10-05', amount: 20000, category: 'groceries' });
    d = add(d, { date: '2026-10-28', kind: 'income', amount: 500000, category: 'salary' });
    d = add(d, { date: '2026-11-20', amount: 4000, category: 'games' });
    d = add(d, { date: '2026-11-20', amount: 100000, category: 'debt' });
    const months = lastMonths(TODAY, 3);
    expect(months).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(monthlyFlows(d, months)).toEqual([
      { month: '2026-09', income: 0, out: 30000, spent: 30000 },
      { month: '2026-10', income: 500000, out: 20000, spent: 20000 },
      { month: '2026-11', income: 0, out: 104000, spent: 4000 },
    ]);
    expect(categoryByMonth(d, 'games', months)).toEqual([30000, 0, 4000]);
    expect(categoryTotals(d, months).map((c) => c.category)).toEqual(['debt', 'games', 'groceries']);
    expect(firstMonthWithEntries(d)).toBe('2026-09');
    expect(firstMonthWithEntries(start())).toBeNull();
  });
});
