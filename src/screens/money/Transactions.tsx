import { ChevronLeft, ChevronRight, FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button, Empty, IconButton, Modal, Panel } from '../../components/ui';
import { useFx } from '../../data/fx';
import { useGame } from '../../data/store';
import type { Transaction } from '../../data/types';
import { formatLong, formatShort } from '../../game/dates';
import { activeTransactions, balance, countsInBalance, monthSummary } from '../../money/calc';
import { categoryName } from '../../money/categories';
import { addMonths, formatMonth, monthOf } from '../../money/format';
import { decodeBankFile, parseOfx, planImport, type ImportRow, type OfxStatement } from '../../money/ofx';
import { Stats, useMoney } from './forms';

export function TxRow({ tx, onEdit }: { tx: Transaction; onEdit(tx: Transaction): void }) {
  const { data, fmt } = useMoney();
  const income = tx.kind === 'income';
  const tags = [
    tx.note && tx.note !== categoryName(tx.category) ? categoryName(tx.category) : null,
    tx.source === 'recurring' ? 'monthly' : tx.source === 'import' ? 'from bank file' : null,
    countsInBalance(data, tx) ? null : 'before starting balance',
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
      <span className="shrink-0 text-sm font-semibold tabular-nums" style={income ? { color: 'var(--stat-vit)' } : undefined}>
        {income ? '+' : '−'}
        {fmt(tx.amount)}
      </span>
    </button>
  );
}

export function Transactions({ onEdit }: { onEdit(tx: Transaction): void }) {
  const { data, today, fmt } = useMoney();
  const toast = useFx((s) => s.toast);
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ rows: ImportRow[]; statement: OfxStatement } | null>(null);

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
    try {
      const statement = parseOfx(decodeBankFile(new Uint8Array(await file.arrayBuffer())));
      setPending({ rows: planImport(data, statement), statement });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'warn');
    }
  };

  return (
    <div className="space-y-4">
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
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => fileInput.current?.click()}>
            <FileUp size={16} /> Import bank file
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
          accept=".ofx,.qfx,.txt,application/x-ofx"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Panel>
      <p className="px-1 text-xs text-mute">
        “Import bank file” reads an OFX statement, the export most banks offer under “Money” or “OFX”. “Spent” leaves
        out debt payments and savings.
      </p>

      {pending && <ImportDialog rows={pending.rows} statement={pending.statement} onClose={() => setPending(null)} />}
    </div>
  );
}

function ImportDialog({ rows, statement, onClose }: { rows: ImportRow[]; statement: OfxStatement; onClose(): void }) {
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
          The file has <strong>{rows.length}</strong> {rows.length === 1 ? 'movement' : 'movements'}
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
              <strong className="text-ink">{logged.length}</strong> look like entries you typed in yourself (same amount,
              within 3 days)
            </li>
          )}
        </ul>

        {logged.length > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4" checked={skipLogged} onChange={(e) => setSkipLogged(e.target.checked)} />
            <span>Skip the {logged.length} that look already typed in</span>
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
