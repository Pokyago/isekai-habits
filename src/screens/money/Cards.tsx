import { ChevronLeft, ChevronRight, CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DateField } from '../../components/DateField';
import { Bar, Button, Empty, Field, IconButton, Modal, Panel, Segmented, inputBase, inputClass } from '../../components/ui';
import { useGame } from '../../data/store';
import type { Card, MonthStr, Transaction } from '../../data/types';
import { daysBetween, formatLong, formatShort } from '../../game/dates';
import type { TxInput } from '../../money/actions';
import { activeCards, billOf, cardSummary, type Bill } from '../../money/cards';
import { categoryName } from '../../money/categories';
import { addMonths, monthsBetween } from '../../money/format';
import { AmountInput, Stats, useAmount, useMoney } from './forms';
import { inDays } from './Subscriptions';

/**
 * Credit cards: what has been bought on each one, bill by bill. Nothing here touches
 * the bank balance until a bill is paid.
 */
export function CreditCards({
  onAdd,
  onEdit,
}: {
  onAdd(initial?: Partial<TxInput>): void;
  onEdit(tx: Transaction): void;
}) {
  const { data } = useMoney();
  const cards = useMemo(() => activeCards(data), [data]);
  const [picked, setPicked] = useState<string | null>(null);
  const [form, setForm] = useState<Card | 'new' | null>(null);
  const card = cards.find((c) => c.id === picked) ?? cards[0];

  return (
    <div className="space-y-4">
      {!card ? (
        <Panel title="Credit card">
          <div className="mx-auto max-w-xl text-center">
            <Empty>
              Write down what you buy on your credit card. It counts as spending the day you buy it, but your bank
              balance stays as it is until you pay the bill.
            </Empty>
            <Button variant="primary" onClick={() => setForm('new')}>
              <Plus size={16} /> Add your card
            </Button>
          </div>
        </Panel>
      ) : (
        <>
          {cards.length > 1 && (
            <div className="max-w-xl">
              <Segmented<string>
                label="Card"
                value={card.id}
                onChange={setPicked}
                options={cards.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          )}
          <CardView key={card.id} card={card} onAdd={onAdd} onEdit={onEdit} onEditCard={() => setForm(card)} />
          <Button variant="ghost" onClick={() => setForm('new')}>
            <Plus size={16} /> Add another card
          </Button>
        </>
      )}
      {form && (
        <CardForm
          card={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={(id) => setPicked(id)}
        />
      )}
    </div>
  );
}

const STATUS_COLOR: Record<Bill['status'], string> = {
  open: 'var(--color-glow)',
  closed: 'var(--color-gold)',
  overdue: 'var(--color-danger)',
  paid: 'var(--stat-vit)',
  empty: 'var(--color-mute)',
};

function statusText(bill: Bill, today: string): string {
  switch (bill.status) {
    case 'open':
      return `Open · closes ${formatShort(bill.closes)}, ${inDays(daysBetween(today, bill.closes))}`;
    case 'closed':
      return `Closed · due ${formatShort(bill.due)}, ${inDays(daysBetween(today, bill.due))}`;
    case 'overdue':
      return `Overdue · it was due ${formatShort(bill.due)}`;
    case 'paid':
      return 'Paid';
    default:
      return 'Closed with nothing on it';
  }
}

function CardView({
  card,
  onAdd,
  onEdit,
  onEditCard,
}: {
  card: Card;
  onAdd(initial?: Partial<TxInput>): void;
  onEdit(tx: Transaction): void;
  onEditCard(): void;
}) {
  const { data, today, fmt } = useMoney();
  const summary = useMemo(() => cardSummary(data, card, today), [data, card, today]);
  // The bill being looked at. Until one is picked: the oldest one waiting to be paid, else the open one.
  const [picked, setPicked] = useState<MonthStr | null>(null);
  const [paying, setPaying] = useState(false);

  const month = picked ?? summary.toPay[0]?.month ?? summary.open.month;
  const bill = useMemo(
    () => summary.bills.find((b) => b.month === month) ?? billOf(data, card, month, today),
    [summary, data, card, month, today],
  );
  const first = summary.bills[0].month;
  const last = summary.bills[summary.bills.length - 1].month;
  const toPayNow = summary.toPay.reduce((n, b) => n + b.left, 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Panel
        title={card.name}
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={onEditCard}>
            <Pencil size={14} /> Edit
          </Button>
        }
      >
        <p className="font-display text-4xl font-bold tabular-nums">{fmt(summary.owedNow)}</p>
        <p className="mt-1 mb-4 text-sm text-mute">on the card so far. It leaves your bank account when you pay the bills.</p>
        <Stats
          items={[
            ['Open bill', fmt(summary.open.left)],
            ['To pay now', fmt(toPayNow), toPayNow > 0 ? 'var(--color-gold)' : undefined],
            ['Later instalments', fmt(summary.later)],
          ]}
        />
        {card.limit !== null && (
          <div className="mt-4">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs text-mute tabular-nums">
              <span>
                {fmt(summary.owed)} of {fmt(card.limit)} limit used
              </span>
              <span>{fmt(Math.max(0, card.limit - summary.owed))} free</span>
            </div>
            <Bar
              value={summary.owed}
              max={card.limit}
              color={summary.owed > card.limit * 0.9 ? 'var(--color-danger)' : 'var(--color-gold)'}
              className="h-2"
            />
          </div>
        )}
        <p className="mt-4 text-xs text-mute">
          The open bill closes on {formatLong(summary.open.closes)} and is due on {formatShort(summary.open.due)}. What
          you buy from the closing day on goes on the next one.
        </p>
        <Button variant="gold" className="mt-4 w-full" onClick={() => onAdd({ kind: 'expense', cardId: card.id })}>
          <Plus size={16} /> Add a purchase
        </Button>
      </Panel>

      <Panel>
        <div className="mb-1 flex items-center justify-between gap-1">
          <IconButton label="The bill before" onClick={() => setPicked(addMonths(month, -1))} disabled={month <= first}>
            <ChevronLeft size={20} />
          </IconButton>
          <div className="min-w-0 text-center">
            <h2 className="font-display text-xl font-bold">Bill due {formatShort(bill.due)}</h2>
            <p className="text-xs font-medium" style={{ color: STATUS_COLOR[bill.status] }}>
              {statusText(bill, today)}
            </p>
          </div>
          <IconButton label="The bill after" onClick={() => setPicked(addMonths(month, 1))} disabled={month >= last}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
        {monthsBetween(first, last) > 0 && (
          <ol className="mb-3 flex justify-center gap-1" aria-label="Bills">
            {summary.bills.map((b) => (
              <li key={b.month}>
                <button
                  type="button"
                  onClick={() => setPicked(b.month)}
                  aria-current={b.month === month ? 'true' : undefined}
                  aria-label={`Bill due ${formatShort(b.due)}: ${fmt(b.total)}, ${statusText(b, today)}`}
                  title={`Due ${formatShort(b.due)} · ${fmt(b.total)}`}
                  className={`block h-2 rounded-full transition-all ${b.month === month ? 'w-6' : 'w-2 opacity-60 hover:opacity-100'}`}
                  style={{ background: STATUS_COLOR[b.status] }}
                />
              </li>
            ))}
          </ol>
        )}

        {bill.purchases.length === 0 && bill.payments.length === 0 ? (
          <Empty>Nothing on this bill yet.</Empty>
        ) : (
          <ul className="space-y-0.5">
            {bill.purchases.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raise"
                >
                  <span className="w-12 shrink-0 text-xs text-mute tabular-nums">{formatShort(t.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.note || categoryName(t.category)}</span>
                    <span className="block truncate text-[11px] text-mute">
                      {categoryName(t.category)}
                      {t.plan ? ` · part ${t.plan.part} of ${t.plan.of}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{fmt(t.amount)}</span>
                </button>
              </li>
            ))}
            {bill.payments.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raise"
                >
                  <span className="w-12 shrink-0 text-xs text-mute tabular-nums">{formatShort(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--stat-vit)' }}>
                    Paid from the bank account
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--stat-vit)' }}>
                    −{fmt(t.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-edge/60 pt-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="text-mute">Total </span>
            <strong className="tabular-nums">{fmt(bill.total)}</strong>
            {bill.paid > 0 && bill.left > 0 && (
              <>
                <span className="text-mute"> · still to pay </span>
                <strong className="tabular-nums">{fmt(bill.left)}</strong>
              </>
            )}
          </p>
          {bill.status !== 'paid' && (
            <Button variant={bill.status === 'open' || bill.status === 'empty' ? 'default' : 'primary'} onClick={() => setPaying(true)}>
              <CreditCard size={16} />
              {bill.left === 0 ? 'Record a payment' : bill.status === 'open' ? 'Pay early' : `Pay ${fmt(bill.left)}`}
            </Button>
          )}
        </div>
      </Panel>

      {paying && <PayBillForm bill={bill} onClose={() => setPaying(false)} />}
    </div>
  );
}

function PayBillForm({ bill, onClose }: { bill: Bill; onClose(): void }) {
  const { today, currency, fmt } = useMoney();
  const payBill = useGame((s) => s.payBill);
  const amount = useAmount(bill.left, currency);
  const [date, setDate] = useState(today);
  const valid = amount.value !== null && amount.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const diff = amount.value === null ? 0 : amount.value - bill.left;

  return (
    <Modal title={`Pay the ${bill.card.name} bill`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          payBill(bill.card.id, bill.month, amount.value!, date);
          onClose();
        }}
      >
        <p className="text-sm text-mute">
          The bill due {formatLong(bill.due)}. You have {fmt(bill.left)} written down on it
          {bill.paid > 0 ? ` still to pay (${fmt(bill.paid)} is already paid)` : ''}.
        </p>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">How much did you pay?</span>
          <AmountInput amount={amount} currency={currency} label="Amount paid" autoFocus large />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Paid on</span>
          <DateField value={date} onChange={setDate} label="Paid on" />
        </div>
        <p className="text-xs text-mute">
          {!valid
            ? 'This takes the amount out of your bank balance.'
            : diff > 0
              ? `This takes ${fmt(amount.value!)} out of your bank balance. It is ${fmt(diff)} more than you wrote down, so that much is added to the bill as “Not itemised” and counted as spending.`
              : diff < 0
                ? `This takes ${fmt(amount.value!)} out of your bank balance. ${fmt(-diff)} stays owed on this bill.`
                : `This takes ${fmt(amount.value!)} out of your bank balance and the bill is paid. It isn’t counted as spending again: the purchases already were.`}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            Pay
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CardForm({ card, onClose, onSaved }: { card?: Card; onClose(): void; onSaved(id: string): void }) {
  const { currency } = useMoney();
  const saveCard = useGame((s) => s.saveCard);
  const deleteCard = useGame((s) => s.deleteCard);
  const [name, setName] = useState(card?.name ?? '');
  const [closing, setClosing] = useState(String(card?.closingDay ?? 3));
  const [due, setDue] = useState(String(card?.dueDay ?? 10));
  const limit = useAmount(card?.limit, currency);
  const [sure, setSure] = useState(false);

  const day = (text: string) => (/^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 31 ? Number(text) : null);
  const closingDay = day(closing);
  const dueDay = day(due);
  const limitOk = limit.text.trim() === '' || (limit.value !== null && limit.value > 0);
  const valid = name.trim() !== '' && closingDay !== null && dueDay !== null && limitOk;
  const dayBox = (bad: boolean) => `${inputBase} w-24 tabular-nums ${bad ? 'border-danger' : ''}`;

  return (
    <Modal title={card ? 'Edit card' : 'New credit card'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveCard({ name, closingDay: closingDay!, dueDay: dueDay!, limit: limit.value }, card?.id);
          if (!card) {
            // The new card is the one to look at.
            const made = Object.values(useGame.getState().data.cards)
              .filter((c) => !c.deleted)
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (made) onSaved(made.id);
          }
          onClose();
        }}
      >
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Itaú Visa" maxLength={40} autoFocus={!card} />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Field label="The bill closes on day">
            <input className={dayBox(closing.trim() !== '' && closingDay === null)} inputMode="numeric" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </Field>
          <Field label="It is due on day">
            <input className={dayBox(due.trim() !== '' && dueDay === null)} inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <p className="-mt-1 text-xs text-mute">
          Days of the month, as on your bill. What you buy from the closing day on goes on the next bill. In a month
          without that day, the last day is used.
        </p>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Limit (optional)</span>
          <AmountInput amount={limit} currency={currency} label="Credit limit" />
        </div>

        <div className="flex items-center gap-2 pt-1">
          {card && (
            <Button
              variant="danger"
              onClick={() => {
                if (!sure) return setSure(true);
                deleteCard(card.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> {sure ? 'Yes, remove it' : 'Remove card'}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {card ? 'Save changes' : 'Add card'}
          </Button>
        </div>
        {sure && (
          <p className="text-xs text-mute">
            The card and its bills go away. What you bought on it stays in your entries as spending.
          </p>
        )}
      </form>
    </Modal>
  );
}
