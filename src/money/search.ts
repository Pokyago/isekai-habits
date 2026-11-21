import type { MonthStr, SaveData, Transaction } from '../data/types';
import { activeTransactions } from './calc';
import { ADJUSTMENT, categoryName } from './categories';
import { addMonths, monthOf, monthsBetween } from './format';

/*
 * Looking something up across every entry ever recorded: what was spent on it, when,
 * and how that changed month by month.
 */

/** Lower case, without accents, so "cafe" finds "Café" and "acai" finds "Açaí". */
export const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** The words of a search. Every one of them has to be found in an entry. */
export function searchWords(query: string): string[] {
  return plain(query).split(/\s+/).filter(Boolean);
}

/** Everything about an entry that can be searched: its note, category, card, date and amount. */
function haystack(data: SaveData, t: Transaction): string {
  const amount = (t.amount / 100).toFixed(2);
  return plain(
    [
      t.note,
      categoryName(t.category),
      t.cardId ? (data.cards[t.cardId]?.name ?? '') : '',
      t.cardId ? 'card' : '',
      t.paysBill ? 'card bill' : '',
      t.kind === 'income' ? 'income' : '',
      t.date,
      // Both ways an amount is written: 45.90 and 45,90.
      amount,
      amount.replace('.', ','),
    ].join(' '),
  );
}

export interface SearchResult {
  /** Newest first. */
  entries: Transaction[];
  /** What the matching entries spent, in cents. Card bills paid and balance corrections are left out. */
  spent: number;
  /** How many entries that is. */
  spentCount: number;
  /** What the matching entries brought in. */
  income: number;
  /** Matching payments of a card bill: listed, but not counted as spending a second time. */
  billsPaid: number;
  first: string | null;
  last: string | null;
  /** Spending month by month, from the first match to the last, with the months in between. */
  byMonth: { month: MonthStr; spent: number; count: number }[];
}

const EMPTY: SearchResult = { entries: [], spent: 0, spentCount: 0, income: 0, billsPaid: 0, first: null, last: null, byMonth: [] };

/** Every entry that has all the words of the search, with what they add up to. */
export function searchEntries(data: SaveData, query: string): SearchResult {
  const words = searchWords(query);
  if (words.length === 0) return EMPTY;

  const entries = activeTransactions(data)
    .filter((t) => {
      const text = haystack(data, t);
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1));
  if (entries.length === 0) return EMPTY;

  let spent = 0;
  let spentCount = 0;
  let income = 0;
  let billsPaid = 0;
  const months = new Map<MonthStr, { spent: number; count: number }>();
  for (const t of entries) {
    if (t.kind === 'income') {
      if (t.category !== ADJUSTMENT) income += t.amount;
      continue;
    }
    if (t.paysBill) {
      billsPaid++;
      continue;
    }
    if (t.category === ADJUSTMENT) continue;
    spent += t.amount;
    spentCount++;
    const m = months.get(monthOf(t.date)) ?? { spent: 0, count: 0 };
    m.spent += t.amount;
    m.count++;
    months.set(monthOf(t.date), m);
  }

  const byMonth: SearchResult['byMonth'] = [];
  if (months.size > 0) {
    const keys = [...months.keys()].sort();
    const span = monthsBetween(keys[0], keys[keys.length - 1]);
    for (let i = 0; i <= span; i++) {
      const month = addMonths(keys[0], i);
      byMonth.push({ month, ...(months.get(month) ?? { spent: 0, count: 0 }) });
    }
  }
  return { entries, spent, spentCount, income, billsPaid, first: entries[entries.length - 1].date, last: entries[0].date, byMonth };
}
