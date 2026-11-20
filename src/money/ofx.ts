import type { DateStr, SaveData, TxKind } from '../data/types';
import { daysBetween } from '../game/dates';
import { guessCategory } from './categories';

/*
 * Reads OFX bank statement files (the "Money"/"OFX" export most banks offer).
 * Only the list of movements and the closing balance are used.
 */

export interface OfxEntry {
  date: DateStr;
  /** Cents; negative for money out. */
  amount: number;
  fitid: string;
  memo: string;
}

export interface OfxStatement {
  entries: OfxEntry[];
  /** The balance the bank reports, and the day it is for. */
  balance: { amount: number; date: DateStr } | null;
}

/** Bank files are often not UTF-8 (Brazilian banks mostly use Windows-1252); the file header says which. */
export function decodeBankFile(bytes: Uint8Array): string {
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 600));
  const utf8 = /encoding\s*[:=]\s*"?(utf-?8|unicode)/i.test(head) && !/charset\s*:\s*1252/i.test(head);
  if (utf8) return new TextDecoder('utf-8').decode(bytes);
  // No clear header: valid UTF-8 wins, otherwise fall back to Windows-1252.
  if (!/charset\s*:\s*(1252|iso-8859)/i.test(head)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      // not UTF-8
    }
  }
  return new TextDecoder('windows-1252').decode(bytes);
}

const field = (block: string, name: string): string => {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return match ? match[1].trim() : '';
};

function toDate(raw: string): DateStr | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toCents(raw: string): number | null {
  let s = raw.replace(/\s/g, '');
  // Some banks write "1.234,56" or "-12,50" instead of the standard "-12.50".
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const value = Number(s);
  return s !== '' && Number.isFinite(value) ? Math.round(value * 100) : null;
}

const unescape = (s: string) =>
  s.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();

export function parseOfx(text: string): OfxStatement {
  if (!/<OFX>/i.test(text) || !/<STMTTRN>/i.test(text)) {
    throw new Error('This doesn’t look like an OFX bank statement, or it has no transactions in it.');
  }
  const entries: OfxEntry[] = [];
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const body = block.split(/<\/STMTTRN>/i)[0];
    const date = toDate(field(body, 'DTPOSTED'));
    const amount = toCents(field(body, 'TRNAMT'));
    if (!date || amount === null || amount === 0) continue;
    const memo = unescape([field(body, 'NAME'), field(body, 'MEMO')].filter(Boolean).join(' · '));
    entries.push({ date, amount, fitid: field(body, 'FITID'), memo });
  }

  let balance: OfxStatement['balance'] = null;
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(text);
  if (ledger) {
    const amount = toCents(field(ledger[1], 'BALAMT'));
    const date = toDate(field(ledger[1], 'DTASOF'));
    if (amount !== null && date) balance = { amount, date };
  }
  return { entries, balance };
}

export interface ImportRow {
  id: string;
  date: DateStr;
  kind: TxKind;
  amount: number;
  note: string;
  category: string;
  /** new: not seen before. imported: already loaded from a file. logged: looks like one typed in by hand. */
  status: 'new' | 'imported' | 'logged';
}

/**
 * Works out what a statement would add. Each movement gets an id made from its own
 * details, so loading the same file twice (or on two devices) never duplicates it.
 */
export function planImport(data: SaveData, statement: OfxStatement): ImportRow[] {
  const typed = Object.values(data.transactions).filter((t) => !t.deleted && t.source !== 'import');
  const used = new Set<string>();
  const seen = new Map<string, number>();

  return statement.entries.map((e) => {
    const base = `imp|${e.date}|${e.amount}|${e.fitid}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}#${n}`;
    const kind: TxKind = e.amount < 0 ? 'expense' : 'income';
    const amount = Math.abs(e.amount);

    let status: ImportRow['status'] = 'new';
    if (data.transactions[id]) {
      status = 'imported';
    } else {
      const twin = typed.find(
        (t) => !used.has(t.id) && t.kind === kind && t.amount === amount && Math.abs(daysBetween(t.date, e.date)) <= 3,
      );
      if (twin) {
        used.add(twin.id);
        status = 'logged';
      }
    }
    return { id, date: e.date, kind, amount, note: e.memo, category: guessCategory(e.memo, kind), status };
  });
}
