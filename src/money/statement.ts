import type { DateStr, SaveData, TxKind } from '../data/types';
import { daysBetween } from '../game/dates';
import { guessCategory } from './categories';

/* What any bank statement file is turned into, whatever its format. */

export interface StatementEntry {
  date: DateStr;
  /** Cents; negative for money out. */
  amount: number;
  /** Something that tells this movement apart from others on the same day: the bank's id, or its description. */
  key: string;
  /** Shown as the entry's note. */
  memo: string;
  /** Extra text that helps guess the category (e.g. the bank's kind of movement). */
  hint?: string;
}

export interface Statement {
  /** Shown to the user, e.g. "OFX" or "Itaú PDF". */
  format: string;
  entries: StatementEntry[];
  /** The balance the bank reports, and the day it is for. */
  balance: { amount: number; date: DateStr } | null;
  /**
   * For formats read from a printed layout: how many of the statement's own daily
   * balances were checked against the rows read, and how many didn't add up.
   */
  checks?: { total: number; failed: number };
}

export interface ImportRow {
  id: string;
  date: DateStr;
  kind: TxKind;
  amount: number;
  note: string;
  category: string;
  /** new: not seen before. imported: this exact movement was imported earlier. logged: looks like an entry that is already there. */
  status: 'new' | 'imported' | 'logged';
}

/**
 * Works out what a statement would add. Each movement gets an id made from its own
 * details, so loading the same file twice (or on two devices) never duplicates it.
 * Movements that match an existing entry by amount and date are flagged as probably
 * already there: typed in by hand, added by a monthly item, or imported from a
 * different kind of file.
 */
export function planImport(data: SaveData, statement: Statement): ImportRow[] {
  const seen = new Map<string, number>();
  const rows = statement.entries.map((e) => {
    const base = `imp|${e.date}|${e.amount}|${e.key}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const kind: TxKind = e.amount < 0 ? 'expense' : 'income';
    return {
      id: n === 1 ? base : `${base}#${n}`,
      date: e.date,
      kind,
      amount: Math.abs(e.amount),
      note: e.memo,
      category: guessCategory(`${e.hint ?? ''} ${e.memo}`, kind),
      status: 'new' as ImportRow['status'],
    };
  });

  // Existing entries that an incoming row could be a duplicate of. Each can match only one row.
  const used = new Set<string>();
  for (const r of rows) {
    if (data.transactions[r.id]) {
      r.status = 'imported';
      used.add(r.id);
    }
  }
  const existing = Object.values(data.transactions).filter((t) => !t.deleted);
  for (const r of rows) {
    if (r.status !== 'new') continue;
    const twin = existing.find(
      (t) =>
        !used.has(t.id) &&
        t.kind === r.kind &&
        t.amount === r.amount &&
        // A hand-typed date can be a few days off the bank's; an imported one is exact.
        Math.abs(daysBetween(t.date, r.date)) <= (t.source === 'import' ? 0 : 3),
    );
    if (twin) {
      used.add(twin.id);
      r.status = 'logged';
    }
  }
  return rows;
}

/** Short fingerprint of a description, for ids of movements that have no bank id. */
export function textKey(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
