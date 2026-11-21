import { CreditCard, Landmark, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Empty, Field, Modal, Panel, Segmented, inputClass } from '../../components/ui';
import { useGame } from '../../data/store';
import type { Subscription } from '../../data/types';
import { daysBetween, formatLong, formatShort } from '../../game/dates';
import { EXPENSE_CATEGORIES, NOT_SPENDING, categoryName, guessCategory } from '../../money/categories';
import { amountText, parseAmount } from '../../money/format';
import {
  chargeCategory,
  fixedCosts,
  nextCharge,
  perMonth,
  subscriptionTotals,
  upcomingCharges,
  type ChargeType,
} from '../../money/subscriptions';
import { AmountInput, Stats, useMoney } from './forms';

/** "today", "tomorrow", "in 12 days". */
export function inDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

const SOON_DAYS = 7;

/** The words that differ between the two lists. Everything else is shared. */
const WORDS: Record<
  ChargeType,
  {
    title: string;
    one: string;
    many: string;
    empty: string;
    add: string;
    next: string;
    ended: string;
    newTitle: string;
    editTitle: string;
    placeholder: string;
    notePlaceholder: string;
    dateLabel: string;
    still: string;
    stillHint: string;
  }
> = {
  subscription: {
    title: 'Subscriptions',
    one: 'subscription',
    many: 'subscriptions',
    empty: 'Add everything you subscribe to, by the month or by the year: streaming, software, memberships, insurance.',
    add: 'Add a subscription',
    next: 'Next charges',
    ended: 'Cancelled',
    newTitle: 'New subscription',
    editTitle: 'Edit subscription',
    placeholder: 'e.g. Netflix, iCloud+',
    notePlaceholder: 'e.g. family plan, shared with Ana',
    dateLabel: 'Next charge date',
    still: 'Still subscribed',
    stillHint: '(untick when you cancel, to keep it on record)',
  },
  bill: {
    title: 'Monthly bills',
    one: 'bill',
    many: 'bills',
    empty: 'Add what you pay every month to keep your life running: lessons, the gym, your dog’s bath, the cleaner, a health plan.',
    add: 'Add a bill',
    next: 'Next due',
    ended: 'Stopped',
    newTitle: 'New monthly bill',
    editTitle: 'Edit bill',
    placeholder: 'e.g. Japanese lessons, gym, dog’s bath',
    notePlaceholder: 'e.g. twice a week, paid by Pix',
    dateLabel: 'Next date it is due',
    still: 'Still paying this',
    stillHint: '(untick when it stops, to keep it on record)',
  },
};

const PAID_WITH: Record<Subscription['paidWith'], string> = {
  card: 'Charged to the credit card',
  bank: 'Taken from the bank account; the entry is added for you',
  manual: 'Paid from the bank account; you record the entry',
};

/**
 * What leaves every month whatever else happens: subscriptions, monthly bills and
 * any other repeating expenses, added together. Shown above both lists and on the overview.
 */
type CostsView = 'expenses' | 'plans';

export function FixedCosts({
  onOpen,
  className = '',
}: {
  /** When given, each line is a button that opens the page it is kept on. */
  onOpen?(view: CostsView): void;
  className?: string;
}) {
  const { data, today, fmt } = useMoney();
  const costs = useMemo(() => fixedCosts(data, today), [data, today]);
  const lines: { view: CostsView; label: string; count: number; amount: number }[] = [
    { view: 'expenses', label: 'Subscriptions', count: costs.subscriptions.count, amount: costs.subscriptions.perMonth },
    { view: 'expenses', label: 'Monthly bills', count: costs.bills.count, amount: costs.bills.perMonth },
  ];
  // Rent, instalments and the like, set to repeat on the Debts & goals page.
  if (costs.other.count > 0) lines.push({ view: 'plans', label: 'Other monthly expenses', count: costs.other.count, amount: costs.other.perMonth });
  const top = Math.max(1, ...lines.map((l) => l.amount));

  return (
    <Panel title="Fixed costs every month" className={className}>
      <div className="grid items-center gap-x-8 gap-y-4 md:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <p className="font-display text-4xl font-bold tabular-nums">{fmt(costs.perMonth)}</p>
          <p className="mt-1 text-sm text-mute">
            leaves every month before anything else · <span className="tabular-nums">{fmt(costs.perYear)}</span> a year
          </p>
        </div>
        <ul className="space-y-2">
          {lines.map((l) => {
            const row = (
              <>
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="whitespace-nowrap">
                    {l.label} <span className="text-xs text-mute">· {l.count}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{fmt(l.amount)}</span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-void/80 ring-1 ring-edge/60">
                  <span
                    className="block h-full rounded-full bg-gold transition-[width] duration-500"
                    style={{ width: `${(l.amount / top) * 100}%` }}
                  />
                </span>
              </>
            );
            return (
              <li key={l.label}>
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(l.view)}
                    className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition-colors hover:bg-raise"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="py-1">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {costs.perMonth === 0 && (
        <p className="mt-3 text-xs text-mute">Add your subscriptions and monthly bills, and this adds them all up.</p>
      )}
    </Panel>
  );
}

/**
 * Everything that is paid month after month, on one page: the total on top, then
 * subscriptions and monthly bills next to each other (one under the other on a narrow screen).
 */
export function MonthlyExpenses() {
  return (
    <div className="space-y-4">
      <FixedCosts />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Charges type="subscription" />
        <Charges type="bill" />
      </div>
      <p className="max-w-3xl text-xs text-mute">
        Only the ones set to “Bank: add the entry” put an entry in your account on their day. The others are just
        listed here, so nothing is counted twice with your card bill or an imported statement.
      </p>
    </div>
  );
}

function Charges({ type }: { type: ChargeType }) {
  const { data, today, fmt } = useMoney();
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const words = WORDS[type];

  const totals = useMemo(() => subscriptionTotals(data, type), [data, type]);
  const upcoming = useMemo(() => upcomingCharges(data, today, type), [data, today, type]);
  const ended = useMemo(
    () =>
      Object.values(data.subscriptions)
        .filter((s) => !s.deleted && !s.active && (s.type ?? 'subscription') === type)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data, type],
  );

  return (
    <div className="min-w-0 space-y-4">
      <Panel
        title={words.title}
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => setEditing('new')}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        {totals.count === 0 ? (
          <div className="text-center">
            <Empty>{words.empty}</Empty>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> {words.add}
            </Button>
          </div>
        ) : (
          <>
            <p className="font-display text-3xl font-bold tabular-nums">
              {fmt(totals.perMonth)} <span className="text-base font-normal text-mute">a month</span>
            </p>
            <p className="mt-1 mb-4 text-sm text-mute">
              {totals.count} active {totals.count === 1 ? words.one : words.many}. Yearly ones are spread over twelve
              months.
            </p>
            <Stats
              items={[
                ['A year', fmt(totals.perYear)],
                ['Card, a month', fmt(totals.onCard)],
                ['Bank, a month', fmt(totals.fromBank)],
              ]}
            />
          </>
        )}
      </Panel>

      {upcoming.length > 0 && (
        <Panel title={words.next}>
          <ul className="space-y-1">
            {upcoming.map(({ sub, date }) => {
              const days = daysBetween(today, date);
              const soon = days <= SOON_DAYS;
              return (
                <li key={sub.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(sub)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-raise"
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${soon ? 'border-gold/60 text-gold' : 'border-edge text-mute'}`}
                      title={PAID_WITH[sub.paidWith]}
                    >
                      {sub.paidWith === 'card' ? <CreditCard size={16} /> : <Landmark size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{sub.name}</span>
                      <span className={`block truncate text-[11px] ${soon ? 'text-gold' : 'text-mute'}`}>
                        {formatShort(date)} · {inDays(days)}
                        {sub.cycle === 'yearly' ? ' · yearly' : ''}
                        {type === 'bill' ? ` · ${categoryName(chargeCategory(sub))}` : ''}
                        {sub.note ? ` · ${sub.note}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{fmt(sub.amount)}</span>
                      {sub.cycle === 'yearly' && (
                        <span className="block text-[11px] text-mute tabular-nums">{fmt(perMonth(sub))} a month</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {ended.length > 0 && (
        <Panel title={words.ended}>
          <ul className="space-y-1">
            {ended.map((sub) => (
              <li key={sub.id}>
                <button
                  type="button"
                  onClick={() => setEditing(sub)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-mute transition-colors hover:bg-raise"
                >
                  <span className="min-w-0 flex-1 truncate text-sm line-through">{sub.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {fmt(sub.amount)} {sub.cycle === 'yearly' ? 'a year' : 'a month'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editing && <ChargeForm type={type} sub={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ChargeForm({ type, sub, onClose }: { type: ChargeType; sub?: Subscription; onClose(): void }) {
  const { today, currency } = useMoney();
  const saveSubscription = useGame((s) => s.saveSubscription);
  const deleteSubscription = useGame((s) => s.deleteSubscription);
  const words = WORDS[type];
  const isBill = type === 'bill';

  const [name, setName] = useState(sub?.name ?? '');
  const [amountField, setAmountField] = useState(sub ? amountText(sub.amount, currency) : '');
  const [cycle, setCycle] = useState<Subscription['cycle']>(sub?.cycle ?? 'monthly');
  // When editing, show the upcoming charge rather than whichever past date was first entered.
  const [anchor, setAnchor] = useState(sub ? nextCharge(sub, today) : today);
  // A bill is usually paid from the account and shows up in the statement; a subscription usually sits on the card.
  const [paidWith, setPaidWith] = useState<Subscription['paidWith']>(sub?.paidWith ?? (isBill ? 'manual' : 'card'));
  const [active, setActive] = useState(sub?.active ?? true);
  const [note, setNote] = useState(sub?.note ?? '');
  // The category follows the name until one is picked by hand.
  const [picked, setPicked] = useState<string | null>(sub ? chargeCategory(sub) : null);
  const guessed = guessCategory(name, 'expense');
  const category = picked ?? (guessed === 'other' ? 'bills' : guessed);

  const amount = amountField.trim() === '' ? null : parseAmount(amountField, currency);
  const valid = name.trim() !== '' && amount !== null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(anchor);
  const next = valid ? nextCharge({ anchor, cycle }, today) : null;

  return (
    <Modal title={sub ? words.editTitle : words.newTitle} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveSubscription(
            { name, amount: amount!, cycle, anchor, paidWith, active, note, ...(isBill ? { type: 'bill' as const, category } : {}) },
            sub?.id,
          );
          onClose();
        }}
      >
        <Field label="What is it?">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={words.placeholder}
            maxLength={60}
            autoFocus={!sub}
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">How often is it paid?</span>
          <Segmented<Subscription['cycle']>
            label="Billing cycle"
            value={cycle}
            onChange={setCycle}
            options={[
              { value: 'monthly', label: 'Every month' },
              { value: 'yearly', label: 'Every year' },
            ]}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">
            {cycle === 'yearly' ? 'Price per year' : 'Price per month'}
          </span>
          <AmountInput amount={{ text: amountField, setText: setAmountField }} currency={currency} label="Price" />
        </div>

        {isBill && (
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setPicked(e.target.value)}>
              {EXPENSE_CATEGORIES.filter((c) => !NOT_SPENDING.has(c.id) && c.id !== 'card').map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={words.dateLabel}>
          <input type="date" className={inputClass} value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </Field>
        {next && next !== anchor && (
          <p className="-mt-2 text-xs text-mute">That date has passed, so the next one is {formatLong(next)}.</p>
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Paid with</span>
          <Segmented<Subscription['paidWith']>
            label="Paid with"
            value={paidWith}
            onChange={setPaidWith}
            options={[
              { value: 'card', label: 'Credit card' },
              { value: 'manual', label: 'Bank: just track' },
              { value: 'bank', label: 'Bank: add the entry' },
            ]}
          />
          <p className="mt-1.5 text-xs text-mute">
            {paidWith === 'card'
              ? 'Only tracked here. The charge is already inside your card bill, so no entry is added.'
              : paidWith === 'manual'
                ? 'Only tracked here. Choose this if you import your bank statement or record the payment yourself, so it isn’t counted twice.'
                : 'An entry is added to your bank account on each date it is due, starting with the next one.'}
          </p>
        </div>

        <Field label="Note (optional)">
          <input
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder={words.notePlaceholder}
          />
        </Field>

        {sub && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {words.still}
            <span className="text-xs text-mute">{words.stillHint}</span>
          </label>
        )}

        <div className="flex items-center gap-2 pt-1">
          {sub && (
            <Button
              variant="danger"
              onClick={() => {
                deleteSubscription(sub.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {sub ? 'Save changes' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
