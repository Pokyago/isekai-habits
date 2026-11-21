import { describe, expect, it } from 'vitest';
import * as actions from '../data/actions';
import { emptySave } from '../data/merge';
import type { SaveData } from '../data/types';
import * as money from './actions';
import { addPurchase, payBill, saveCard } from './cardActions';
import { plain, searchEntries, searchWords } from './search';

const TODAY = '2026-11-20';
const T0 = Date.parse('2026-06-01T09:00:00');

function start(): SaveData {
  let d = actions.createHero(emptySave(), 'Tester', 'mage', [], '2026-06-01', T0);
  d = money.setupMoney(d, 500_000, null, 'BRL', '2026-06-01', T0);
  const add = (date: string, kind: 'expense' | 'income', amount: number, category: string, note: string) => {
    d = money.saveTransaction(d, { date, kind, amount, category, note, goalId: null, debtId: null }, undefined, TODAY, T0 + Object.keys(d.transactions).length);
  };
  add('2026-08-03', 'expense', 4_590, 'eating', 'Café Açaí do João');
  add('2026-08-20', 'expense', 3_000, 'eating', 'cafe da esquina');
  add('2026-10-05', 'expense', 5_210, 'eating', 'Café Açaí do João');
  add('2026-10-06', 'expense', 12_000, 'groceries', 'Mercado');
  add('2026-11-01', 'income', 300_000, 'salary', 'Salary');
  add('2026-11-02', 'income', 2_000, 'refund', 'Refund from the café');
  return d;
}

describe('searching the entries', () => {
  it('ignores case and accents, and needs every word', () => {
    expect(plain('Café Açaí')).toBe('cafe acai');
    expect(searchWords('  Café   JOÃO ')).toEqual(['cafe', 'joao']);
    const d = start();
    expect(searchEntries(d, 'cafe').entries.map((t) => t.note)).toEqual([
      'Refund from the café',
      'Café Açaí do João',
      'cafe da esquina',
      'Café Açaí do João',
    ]);
    expect(searchEntries(d, 'CAFE joao').entries).toHaveLength(2);
    expect(searchEntries(d, 'cafe pizza').entries).toEqual([]);
    expect(searchEntries(d, '   ')).toMatchObject({ entries: [], spent: 0 });
  });

  it('adds up what was spent and what came in, with the first and last time', () => {
    const r = searchEntries(start(), 'cafe');
    expect(r).toMatchObject({ spent: 12_800, spentCount: 3, income: 2_000, billsPaid: 0, first: '2026-08-03', last: '2026-11-02' });
  });

  it('shows the spending month by month, with the empty months in between', () => {
    expect(searchEntries(start(), 'cafe').byMonth).toEqual([
      { month: '2026-08', spent: 7_590, count: 2 },
      { month: '2026-09', spent: 0, count: 0 },
      { month: '2026-10', spent: 5_210, count: 1 },
    ]);
    // Only money in: nothing to chart.
    expect(searchEntries(start(), 'salary').byMonth).toEqual([]);
  });

  it('finds by category, by amount written either way, and by date', () => {
    const d = start();
    expect(searchEntries(d, 'eating out').spentCount).toBe(3);
    expect(searchEntries(d, 'groceries').entries.map((t) => t.note)).toEqual(['Mercado']);
    expect(searchEntries(d, '45,90').entries).toHaveLength(1);
    expect(searchEntries(d, '45.90').entries).toHaveLength(1);
    expect(searchEntries(d, '2026-10').entries).toHaveLength(2);
  });

  it('finds what was bought on a card by the card’s name, and never counts a bill payment as spending', () => {
    let d = saveCard(start(), { name: 'Itaú Visa', closingDay: 3, dueDay: 10, limit: null }, undefined, T0 + 50);
    const card = Object.keys(d.cards)[0];
    d = addPurchase(d, { cardId: card, date: '2026-11-05', amount: 9_000, category: 'shopping', note: 'Headphones', parts: 1 }, TODAY, T0 + 60);
    d = payBill(d, card, '2026-12', 9_000, '2026-12-09', '2026-12-09', T0 + 70);

    const r = searchEntries(d, 'itau');
    expect(r.entries.map((t) => t.note)).toEqual(['Itaú Visa bill', 'Headphones']);
    expect(r).toMatchObject({ spent: 9_000, spentCount: 1, billsPaid: 1 });
    expect(searchEntries(d, 'card bill').entries.map((t) => t.note)).toEqual(['Itaú Visa bill']);
  });

  it('leaves deleted entries out', () => {
    let d = start();
    const id = Object.values(d.transactions).find((t) => t.note === 'Mercado')!.id;
    d = money.deleteTransaction(d, id, T0 + 99);
    expect(searchEntries(d, 'mercado').entries).toEqual([]);
  });
});
