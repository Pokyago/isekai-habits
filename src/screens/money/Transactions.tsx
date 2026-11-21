import { ChevronLeft, ChevronRight, CreditCard, FileUp, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { BarChart } from '../../components/BarChart';
import { CHART_COLORS } from '../../components/LineChart';
import { Button, Empty, IconButton, Modal, Panel, inputBase } from '../../components/ui';
import { useFx } from '../../data/fx';
import { useGame } from '../../data/store';
import type { Transaction } from '../../data/types';
import { formatLong, formatShort } from '../../game/dates';
import { activeTransactions, balance, countsInBalance, monthSummary } from '../../money/calc';
import { categoryName } from '../../money/categories';
import { addMonths, formatMonth, formatMonthShort, formatWhole, monthOf } from '../../money/format';
import { isItauStatement, parseItau } from '../../money/itau';
import { decodeBankFile, parseOfx } from '../../money/ofx';
import { searchEntries } from '../../money/search';
import { planImport, type ImportRow, type Statement } from '../../money/statement';
import { Stats, useMoney } from './forms';

export function TxRow({ tx, onEdit }: { tx: Transaction; onEdit(tx: Transaction): void }) {
  const { data, fmt } = useMoney();
  const income = tx.kind === 'income';
  const tags = [
    tx.note && tx.note !== categoryName(tx.category) ? categoryName(tx.category) : null,
    tx.source === 'recurring' ? 'automatic' : tx.source === 'import' ? 'from bank file' : null,
    tx.cardId
      ? `${data.cards[tx.cardId]?.name ?? 'Card'}${tx.plan ? ` · part ${tx.plan.part} of ${tx.plan.of}` : ''}`
      : tx.paysBill
        ? 'card bill paid'
        : countsInBalance(data, tx)
          ? null
          : 'before starting balance',
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onEdit(tx)}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-raise"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{tx.note || categoryName(tx.category)}</span>
        {tags.length > 0 && <span className="block truncate text-[11px] text-mute">{tags.join(' · ')}</span>}
      </span>
      {tx.cardId && (
        <span className="shrink-0 text-mute" title="On the credit card: not out of the bank yet">
          <CreditCard size={15} aria-label="On the credit card" />
        </span>
      )}
      <span className="shrink-0 text-sm font-semibold tabular-nums" style={income ? { color: 'var(--stat-vit)' } : undefined}>
        {income ? '+' : '−'}
        {fmt(tx.amount)}
      </span>
    </button>
  );
}

const isPdf = (bytes: Uint8Array) => bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"

/** PDF statements are read by layout, so each bank's needs its own reader. The PDF library loads only when needed. */
async function readPdfStatement(bytes: Uint8Array): Promise<Statement> {
  const { readPdfLines } = await import('../../money/pdfText');
  const lines = await readPdfLines(bytes);
  if (!isItauStatement(lines)) {
    throw new Error('This PDF isn’t a statement layout the app can read yet. Itaú account statements and OFX files work.');
  }
  return parseItau(lines);
}

export function Transactions({ onEdit }: { onEdit(tx: Transaction): void }) {
  const { data, today, fmt } = useMoney();
  const toast = useFx((s) => s.toast);
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ rows: ImportRow[]; statement: Statement } | null>(null);
  const [reading, setReading] = useState(false);
  // What is being looked up across every entry; empty shows the month as usual.
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;

  const summary = useMemo(() => monthSummary(data, month), [data, month]);
  const days = useMemo(() => {
    const list = activeTransactions(data)
      .filter((t) => monthOf(t.date) === month)
      .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1));
    const groups: { date: string; items: Transaction[] }[] = [];
    for (const t of list) {
      const last = groups[groups.length - 1];
      if (last && last.date === t.date) last.items.push(t);
      else groups.push({ date: t.date, items: [t] });
    }
    return groups;
  }, [data, month]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const statement = isPdf(bytes) ? await readPdfStatement(bytes) : parseOfx(decodeBankFile(bytes));
      setPending({ rows: planImport(data, statement), statement });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'warn');
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute" aria-hidden />
        <input
          type="search"
          className={`${inputBase} w-full pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="Search all entries: a name, a category, a card, an amount"
          aria-label="Search all entries"
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-mute hover:bg-raise hover:text-ink"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {searching ? (
        <SearchResults query={query} onEdit={onEdit} />
      ) : (
        <>
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <h2 className="font-display text-xl font-bold capitalize">{formatMonth(month)}</h2>
        <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= addMonths(thisMonth, 1)}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <Stats
        tone="panel"
        items={[
          ['Money in', fmt(summary.income), 'var(--stat-vit)'],
          ['Money out', fmt(summary.out)],
          ['Spent', fmt(summary.spent)],
        ]}
      />

      <Panel
        title="Entries"
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => fileInput.current?.click()} disabled={reading}>
            <FileUp size={16} /> {reading ? 'Reading…' : 'Import bank file'}
          </Button>
        }
      >
        {days.length === 0 ? (
          <Empty>Nothing recorded for this month.</Empty>
        ) : (
          <div className="space-y-3">
            {days.map((group) => (
              <section key={group.date}>
                <h3 className="px-2 text-[11px] font-semibold tracking-wide text-mute uppercase">{formatLong(group.date)}</h3>
                {group.items.map((t) => (
                  <TxRow key={t.id} tx={t} onEdit={onEdit} />
                ))}
              </section>
            ))}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.ofx,.qfx,.txt,application/pdf,application/x-ofx"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Panel>
      <p className="px-1 text-xs text-mute">
        “Import bank file” reads an Itaú account statement saved as PDF, or an OFX file from any bank. The file is read
        on this device and never uploaded. “Money out” is what left the bank. “Spent” leaves out debt payments, savings
        and card bills paid, and counts what you bought on the card.
      </p>
        </>
      )}

      {pending && <ImportDialog rows={pending.rows} statement={pending.statement} onClose={() => setPending(null)} />}
    </div>
  );
}

const SHOWN_AT_FIRST = 100;

/** Everything that matches a search, from all time: what it adds up to, month by month, and each entry. */
function SearchResults({ query, onEdit }: { query: string; onEdit(tx: Transaction): void }) {
  const { data, currency, fmt } = useMoney();
  const result = useMemo(() => searchEntries(data, query), [data, query]);
  const [showAll, setShowAll] = useState(false);

  if (result.entries.length === 0) {
    return (
      <Panel>
        <Empty>
          Nothing found for “{query.trim()}”. Try part of the note, a category such as “groceries”, a card’s name, or
          an amount.
        </Empty>
      </Panel>
    );
  }

  const shown = showAll ? result.entries : result.entries.slice(0, SHOWN_AT_FIRST);
  const groups: { month: string; items: Transaction[] }[] = [];
  for (const tx of shown) {
    const month = monthOf(tx.date);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(tx);
    else groups.push({ month, items: [tx] });
  }
  const totals = new Map(result.byMonth.map((m) => [m.month, m.spent]));
  const active = result.byMonth.filter((m) => m.count > 0);
  const oneDay = result.first === result.last;

  return (
    <>
      <Stats
        tone="panel"
        items={[
          ['Spent in all', fmt(result.spent)],
          result.income > 0 ? ['Came in', fmt(result.income), 'var(--stat-vit)'] : ['Times', String(result.spentCount)],
          ['Each time, on average', result.spentCount > 0 ? fmt(Math.round(result.spent / result.spentCount)) : '–'],
        ]}
      />
      <p className="px-1 text-sm text-mute">
        {result.entries.length} {result.entries.length === 1 ? 'entry' : 'entries'}
        {oneDay ? ` on ${formatLong(result.first!)}` : `, from ${formatLong(result.first!)} to ${formatLong(result.last!)}`}.
        {active.length > 1 &&
          ` Spent in ${active.length} of ${result.byMonth.length} months, about ${fmt(Math.round(result.spent / active.length))} in a month that has any.`}
        {result.billsPaid > 0 &&
          ` ${result.billsPaid} card bill ${result.billsPaid === 1 ? 'payment is' : 'payments are'} listed but not counted: what was bought with the card is.`}
      </p>

      {result.byMonth.length > 1 && (
        <Panel title="Month by month">
          <BarChart
            categories={result.byMonth.map((m) => ({ key: m.month, short: formatMonthShort(m.month), long: formatMonth(m.month) }))}
            series={[{ name: 'Spent', color: CHART_COLORS[0], values: result.byMonth.map((m) => m.spent / 100) }]}
            format={(v) => formatWhole(Math.round(v * 100), currency)}
            formatValue={(v) => fmt(Math.round(v * 100))}
            axisWidth={64}
            height={220}
            label={`What was spent on “${query.trim()}” in each month`}
          />
        </Panel>
      )}

      <Panel title="Entries found" right={<span className="text-xs text-mute tabular-nums">{result.entries.length}</span>}>
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.month}>
              <h3 className="flex items-baseline justify-between gap-3 px-2 text-[11px] font-semibold tracking-wide text-mute uppercase">
                <span>{formatMonth(g.month)}</span>
                {(totals.get(g.month) ?? 0) > 0 && <span className="tabular-nums">{fmt(totals.get(g.month)!)}</span>}
              </h3>
              {g.items.map((tx) => (
                <div key={tx.id} className="flex items-center">
                  <span className="w-14 shrink-0 pl-2 text-xs text-mute tabular-nums">{formatShort(tx.date)}</span>
                  <div className="min-w-0 flex-1">
                    <TxRow tx={tx} onEdit={onEdit} />
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        {!showAll && result.entries.length > SHOWN_AT_FIRST && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setShowAll(true)}>
            Show all {result.entries.length}
          </Button>
        )}
      </Panel>
    </>
  );
}

function ImportDialog({ rows, statement, onClose }: { rows: ImportRow[]; statement: Statement; onClose(): void }) {
  const { data, fmt } = useMoney();
  const importRows = useGame((s) => s.importRows);
  const correctBalance = useGame((s) => s.correctBalance);
  const toast = useFx((s) => s.toast);
  const [skipLogged, setSkipLogged] = useState(true);
  const [matchBalance, setMatchBalance] = useState(true);

  const fresh = rows.filter((r) => r.status === 'new');
  const logged = rows.filter((r) => r.status === 'logged');
  const imported = rows.length - fresh.length - logged.length;
  const chosen = skipLogged ? fresh : [...fresh, ...logged];
  const opening = data.money!.openingDate;
  const early = chosen.filter((r) => r.date < opening).length;
  const dates = rows.map((r) => r.date).sort();
  const bank = statement.balance && statement.balance.date >= opening ? statement.balance : null;
  const nothingToDo = chosen.length === 0 && !(bank && matchBalance && balance(data, bank.date) !== bank.amount);

  const confirm = () => {
    if (chosen.length > 0) importRows(chosen);
    if (bank && matchBalance) correctBalance(bank.amount, bank.date);
    toast(chosen.length === 1 ? 'Added 1 entry from the bank file' : `Added ${chosen.length} entries from the bank file`, 'info');
    onClose();
  };

  return (
    <Modal title="Import bank file" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>
          This {statement.format} statement has <strong>{rows.length}</strong> {rows.length === 1 ? 'movement' : 'movements'}
          {dates.length > 0 && (
            <>
              , from {formatShort(dates[0])} to {formatShort(dates[dates.length - 1])}
            </>
          )}
          .
        </p>
        <ul className="space-y-1 text-mute">
          <li>
            <strong className="text-ink">{fresh.length}</strong> new
          </li>
          {imported > 0 && (
            <li>
              <strong className="text-ink">{imported}</strong> already imported before (skipped)
            </li>
          )}
          {logged.length > 0 && (
            <li>
              <strong className="text-ink">{logged.length}</strong> look like entries you already have (same amount,
              same day or within 3 days of one you typed in)
            </li>
          )}
        </ul>

        {statement.checks && statement.checks.total > 0 && (
          <p className={`rounded-lg border px-3 py-2 text-xs ${statement.checks.failed > 0 ? 'border-danger/60 bg-danger/10 text-ink' : 'border-edge/70 text-mute'}`}>
            {statement.checks.failed > 0
              ? `Careful: in ${statement.checks.failed} of ${statement.checks.total} places the daily balance printed in the statement doesn’t match the rows read, so some rows may have been misread. Check the entries after importing.`
              : statement.checks.total === 1
                ? 'Checked: the daily balance printed in the statement matches the rows read.'
                : `Checked: all ${statement.checks.total} daily balances printed in the statement match the rows read.`}
          </p>
        )}

        {logged.length > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={skipLogged} onChange={(e) => setSkipLogged(e.target.checked)} />
            <span>Skip the {logged.length} that look like ones you already have</span>
          </label>
        )}
        {bank && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={matchBalance} onChange={(e) => setMatchBalance(e.target.checked)} />
            <span>
              Match my balance to the bank’s: <strong>{fmt(bank.amount)}</strong> on {formatLong(bank.date)}. Any
              difference is added as one correction entry.
            </span>
          </label>
        )}
        {early > 0 && (
          <p className="text-xs text-mute">
            {early} of these {early === 1 ? 'is' : 'are'} from before your starting balance ({formatLong(opening)}). They
            are recorded for your monthly totals but don’t change the balance.
          </p>
        )}

        {chosen.length > 0 && (
          <ul className="max-h-56 divide-y divide-edge/50 overflow-y-auto rounded-lg border border-edge/70 bg-void/40">
            {chosen.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-12 shrink-0 text-xs text-mute">{formatShort(r.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.note || categoryName(r.category)}</span>
                  <span className="block text-[11px] text-mute">{categoryName(r.category)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums" style={r.kind === 'income' ? { color: 'var(--stat-vit)' } : undefined}>
                  {r.kind === 'income' ? '+' : '−'}
                  {fmt(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-mute">Categories are a first guess from the description. Tap an entry later to change it.</p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={nothingToDo}>
            {chosen.length > 0 ? `Import ${chosen.length}` : 'Match balance'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
