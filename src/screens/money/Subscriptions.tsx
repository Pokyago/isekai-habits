import { CreditCard, Landmark, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Empty, Field, Modal, Panel, Segmented, inputClass } from '../../components/ui';
import { useGame } from '../../data/store';
import type { Subscription } from '../../data/types';
import { daysBetween, formatLong, formatShort } from '../../game/dates';
import { amountText, parseAmount } from '../../money/format';
import { nextCharge, perMonth, subscriptionTotals, upcomingCharges } from '../../money/subscriptions';
import { AmountInput, Stats, useMoney } from './forms';

/** "today", "tomorrow", "in 12 days". */
export function inDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

const SOON_DAYS = 7;

export function Subscriptions() {
  const { data, today, fmt } = useMoney();
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);

  const totals = useMemo(() => subscriptionTotals(data), [data]);
  const upcoming = useMemo(() => upcomingCharges(data, today), [data, today]);
  const cancelled = useMemo(
    () =>
      Object.values(data.subscriptions)
        .filter((s) => !s.deleted && !s.active)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Subscriptions"
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => setEditing('new')}>
            <Plus size={16} /> Add
          </Button>
        }
      >
        {totals.count === 0 ? (
          <div className="text-center">
            <Empty>
              Add everything you pay for regularly, by the month or by the year: streaming, software, memberships,
              insurance.
            </Empty>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Add a subscription
            </Button>
          </div>
        ) : (
          <>
            <p className="font-display text-3xl font-bold tabular-nums">
              {fmt(totals.perMonth)} <span className="text-base font-normal text-mute">a month</span>
            </p>
            <p className="mt-1 mb-4 text-sm text-mute">
              {totals.count} active {totals.count === 1 ? 'subscription' : 'subscriptions'}. Yearly ones are spread over
              twelve months.
            </p>
            <Stats
              items={[
                ['A year', fmt(totals.perYear)],
                ['On the card, a month', fmt(totals.onCard)],
                ['From the bank, a month', fmt(totals.fromBank)],
              ]}
            />
          </>
        )}
      </Panel>

      {upcoming.length > 0 && (
        <Panel title="Next charges">
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
                      title={sub.paidWith === 'card' ? 'Charged to the credit card' : 'Taken from the bank account'}
                    >
                      {sub.paidWith === 'card' ? <CreditCard size={16} /> : <Landmark size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{sub.name}</span>
                      <span className={`block truncate text-[11px] ${soon ? 'text-gold' : 'text-mute'}`}>
                        {formatShort(date)} · {inDays(days)}
                        {sub.cycle === 'yearly' ? ' · yearly' : ''}
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
          <p className="mt-3 text-xs text-mute">
            Ones taken from the bank account are added to your entries on the day they are charged. Ones on the credit
            card are only listed here, because they are already part of the card bill.
          </p>
        </Panel>
      )}

      {cancelled.length > 0 && (
        <Panel title="Cancelled">
          <ul className="space-y-1">
            {cancelled.map((sub) => (
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

      {editing && <SubscriptionForm sub={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SubscriptionForm({ sub, onClose }: { sub?: Subscription; onClose(): void }) {
  const { today, currency } = useMoney();
  const saveSubscription = useGame((s) => s.saveSubscription);
  const deleteSubscription = useGame((s) => s.deleteSubscription);

  const [name, setName] = useState(sub?.name ?? '');
  const [amountField, setAmountField] = useState(sub ? amountText(sub.amount, currency) : '');
  const [cycle, setCycle] = useState<Subscription['cycle']>(sub?.cycle ?? 'monthly');
  // When editing, show the upcoming charge rather than whichever past date was first entered.
  const [anchor, setAnchor] = useState(sub ? nextCharge(sub, today) : today);
  const [paidWith, setPaidWith] = useState<Subscription['paidWith']>(sub?.paidWith ?? 'card');
  const [active, setActive] = useState(sub?.active ?? true);
  const [note, setNote] = useState(sub?.note ?? '');

  const amount = amountField.trim() === '' ? null : parseAmount(amountField, currency);
  const valid = name.trim() !== '' && amount !== null && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(anchor);
  const next = valid ? nextCharge({ anchor, cycle }, today) : null;

  return (
    <Modal title={sub ? 'Edit subscription' : 'New subscription'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveSubscription({ name, amount: amount!, cycle, anchor, paidWith, active, note }, sub?.id);
          onClose();
        }}
      >
        <Field label="What is it?">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Netflix, iCloud+, gym"
            maxLength={60}
            autoFocus={!sub}
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">How often is it charged?</span>
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

        <Field label="Next charge date">
          <input type="date" className={inputClass} value={anchor} onChange={(e) => setAnchor(e.target.value)} />
        </Field>
        {next && next !== anchor && (
          <p className="-mt-2 text-xs text-mute">That date has passed, so the next charge is {formatLong(next)}.</p>
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Paid with</span>
          <Segmented<Subscription['paidWith']>
            label="Paid with"
            value={paidWith}
            onChange={setPaidWith}
            options={[
              { value: 'card', label: 'Credit card' },
              { value: 'bank', label: 'Bank account' },
            ]}
          />
          <p className="mt-1.5 text-xs text-mute">
            {paidWith === 'card'
              ? 'Only tracked here. The charge is already inside your card bill, so no entry is added.'
              : 'An entry is added to your bank account on each charge date, starting with the next one.'}
          </p>
        </div>

        <Field label="Note (optional)">
          <input
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={80}
            placeholder="e.g. family plan, shared with Ana"
          />
        </Field>

        {sub && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Still subscribed
            <span className="text-xs text-mute">(untick when you cancel, to keep it on record)</span>
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
