import type { DateStr } from '../data/types';
import type { Statement, StatementEntry } from './statement';
import { textKey } from './statement';

/*
 * Reads an Itaú current-account statement saved as PDF ("Extrato conta corrente").
 *
 * The page is a table: Data | Lançamentos | Descrição | Valor (R$) | Saldo (R$).
 * - A row with a value is a movement. Its kind and description can wrap onto
 *   following lines that have no date.
 * - A row with only a date and a balance is that day's closing balance.
 * - "Lançamentos futuros" lists things that haven't happened yet and is skipped.
 *
 * The input is the PDF's text as positioned lines (see pdfText.ts), so the reading
 * itself needs no PDF library and can be tested with plain data.
 */

export interface PdfItem {
  x: number;
  /** Width. */
  w: number;
  text: string;
}

/** One visual line of a page: its text items, left to right. */
export interface PdfLine {
  items: PdfItem[];
}

const DATE_THEN_TEXT = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(.+))?$/;
const MONEY = /^[-−]?\s?\d{1,3}(\.\d{3})*,\d{2}$/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const lineText = (line: PdfLine) => clean(line.items.map((i) => i.text).join(' '));

function cents(text: string): number {
  const negative = /^[-−]/.test(text.trim());
  const value = Math.round(Number(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return negative ? -value : value;
}

interface Columns {
  kind: number;
  description: number;
  value: number;
  balance: number;
}

/** The table's header row gives the x position of each column. */
function readHeader(line: PdfLine): Columns | null {
  const at = (start: string) => line.items.find((i) => clean(i.text).startsWith(start))?.x;
  const kind = at('Lançamentos');
  const description = at('Descrição');
  const value = at('Valor');
  const balance = at('Saldo');
  if (!line.items.some((i) => clean(i.text) === 'Data')) return null;
  if (kind === undefined || description === undefined || value === undefined || balance === undefined) return null;
  return { kind, description, value, balance };
}

export function isItauStatement(lines: PdfLine[]): boolean {
  return lines.some((l) => readHeader(l) !== null) && lines.some((l) => /extrato/i.test(lineText(l)));
}

interface Draft {
  date: DateStr;
  amount: number;
  kind: string;
  description: string;
}

export function parseItau(lines: PdfLine[]): Statement {
  let columns: Columns | null = null;
  let inMovements = false;
  let last: Draft | null = null;
  const drafts: Draft[] = [];
  const closings: { date: DateStr; amount: number }[] = [];

  let headline: number | null = null;
  let issued: DateStr | null = null;
  let expectBalance = false;

  for (const line of lines) {
    const text = lineText(line);
    if (text === '') continue;

    // The summary at the top: "Saldo em conta" with the amount on the next line, and the issue date.
    if (expectBalance) {
      const m = /^([-−]?)\s*R\$\s*([-−]?\s?[\d.]+,\d{2})/.exec(text);
      if (m && headline === null) headline = m[1] ? -Math.abs(cents(m[2])) : cents(m[2]);
      expectBalance = false;
    }
    if (/^Saldo em conta$/i.test(text)) expectBalance = true;
    const emitted = /Emitido em:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
    if (emitted && !issued) issued = `${emitted[3]}-${emitted[2]}-${emitted[1]}`;

    const header = readHeader(line);
    if (header) {
      columns = header;
      continue;
    }
    if (line.items.length === 1 && text === 'Lançamentos') {
      inMovements = true;
      last = null;
      continue;
    }
    if (!columns || !inMovements) continue;

    const first = line.items[0];
    if (first.x < columns.kind - 5) {
      // Some PDF readers hand over the date and the kind as one piece of text ("19/11/2026 SALÁRIO").
      const m = DATE_THEN_TEXT.exec(clean(first.text));
      if (!m) {
        // A heading in the date column ("Posição consolidada", …): the list is over.
        inMovements = false;
        last = null;
        continue;
      }
      const draft: Draft = { date: `${m[3]}-${m[2]}-${m[1]}`, amount: 0, kind: m[4] ?? '', description: '' };
      let value: number | null = null;
      let closing: number | null = null;
      for (const item of line.items.slice(1)) {
        const t = clean(item.text);
        const right = item.x + item.w;
        // Amounts are right-aligned in their column, so the right edge says which one it is.
        if (MONEY.test(t) && right > columns.value) {
          if (right > columns.balance) closing = cents(t);
          else value = cents(t);
        } else if (item.x < columns.description - 5) {
          draft.kind = clean(`${draft.kind} ${t}`);
        } else {
          draft.description = clean(`${draft.description} ${t}`);
        }
      }
      if (closing !== null) closings.push({ date: draft.date, amount: closing });
      if (value !== null && value !== 0) {
        draft.amount = value;
        drafts.push(draft);
        last = draft;
      } else {
        last = null;
      }
    } else if (last) {
      // A wrapped line: more of the kind and/or the description of the row above.
      for (const item of line.items) {
        const t = clean(item.text);
        if (item.x < columns.description - 5) last.kind = clean(`${last.kind} ${t}`);
        else last.description = clean(`${last.description} ${t}`);
      }
    }
  }

  if (!columns) throw new Error('This PDF doesn’t look like an Itaú account statement.');
  if (drafts.length === 0) throw new Error('No movements were found in this statement.');

  const entries: StatementEntry[] = drafts.map((d) => {
    // Older rows repeat the kind as the description ("PIX ENVIADO / PIX ENVIADO").
    const memo = d.description && d.description !== d.kind ? d.description : d.kind;
    return { date: d.date, amount: d.amount, key: textKey(`${d.kind}|${d.description}`), memo, hint: d.kind };
  });

  return {
    format: 'Itaú PDF',
    entries,
    balance: headline !== null && issued ? { amount: headline, date: issued } : null,
    checks: checkClosings(entries, closings),
  };
}

/**
 * The statement prints most days' closing balance. Between two of them, the
 * movements read must add up to the difference; if they don't, something was misread.
 */
function checkClosings(entries: StatementEntry[], closings: { date: DateStr; amount: number }[]) {
  const sorted = [...closings].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const between = (from: DateStr, to: DateStr) => {
    let sum = 0;
    for (const e of entries) if (e.date > from && e.date <= to) sum += e.amount;
    return sum;
  };

  // An overdrawn day's balance is printed without its minus sign (the PDF only colours it),
  // so a printed balance may stand for either sign. The running total says which.
  let failed = 0;
  let running = sorted[0]?.amount ?? 0;
  for (let i = 1; i < sorted.length; i++) {
    const printed = sorted[i].amount;
    let expected = running + between(sorted[i - 1].date, sorted[i].date);
    if (i === 1 && Math.abs(expected) !== printed) {
      // The very first balance may itself have been overdrawn.
      const flipped = -running + between(sorted[0].date, sorted[1].date);
      if (Math.abs(flipped) === printed) expected = flipped;
    }
    if (expected === printed || expected === -printed) {
      running = expected;
    } else {
      failed++;
      running = printed;
    }
  }
  return { total: Math.max(0, sorted.length - 1), failed };
}
