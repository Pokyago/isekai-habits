import type { DateStr } from '../data/types';
import type { Statement, StatementEntry } from './statement';

/*
 * Reads OFX bank statement files (the "Money"/"OFX" export most banks offer).
 * Only the list of movements and the closing balance are used.
 */

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

export function parseOfx(text: string): Statement {
  if (!/<OFX>/i.test(text) || !/<STMTTRN>/i.test(text)) {
    throw new Error('This doesn’t look like an OFX bank statement, or it has no transactions in it.');
  }
  const entries: StatementEntry[] = [];
  for (const block of text.split(/<STMTTRN>/i).slice(1)) {
    const body = block.split(/<\/STMTTRN>/i)[0];
    const date = toDate(field(body, 'DTPOSTED'));
    const amount = toCents(field(body, 'TRNAMT'));
    if (!date || amount === null || amount === 0) continue;
    const memo = unescape([field(body, 'NAME'), field(body, 'MEMO')].filter(Boolean).join(' · '));
    entries.push({ date, amount, key: field(body, 'FITID'), memo });
  }

  let balance: Statement['balance'] = null;
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i.exec(text);
  if (ledger) {
    const amount = toCents(field(ledger[1], 'BALAMT'));
    const date = toDate(field(ledger[1], 'DTASOF'));
    if (amount !== null && date) balance = { amount, date };
  }
  return { format: 'OFX', entries, balance };
}
