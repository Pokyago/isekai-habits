import { Trash2 } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { DateField } from '../../components/DateField';
import { Button, Field, Modal, Segmented, inputClass } from '../../components/ui';
import { useGame } from '../../data/store';
import type { Debt, Goal, Recurring, Transaction, TxKind } from '../../data/types';
import { formatLong } from '../../game/dates';
import { useToday } from '../../hooks';
import { BUDGET_REWARD } from '../../money/actions';
import type { TxInput } from '../../money/actions';
import { balance, debtRemaining } from '../../money/calc';
import { categoriesFor, defaultCategory } from '../../money/categories';
import { CURRENCIES, DEFAULT_CURRENCY, addMonths, amountText, formatMoney, monthOf, parseAmount } from '../../money/format';

/** The save, today's date, and a money formatter for the chosen currency. */
export function useMoney() {
  const data = useGame((s) => s.data);
  const today = useToday();
  const currency = data.money?.currency ?? DEFAULT_CURRENCY;
  const fmt = useCallback((cents: number) => formatMoney(cents, currency), [currency]);
  return { data, today, currency, fmt };
}

/** Three figures side by side on a wide screen, stacked as label/value rows on a phone so long amounts fit. */
export function Stats({ items, tone = 'void' }: { items: readonly (readonly [label: string, value: string, color?: string])[]; tone?: 'void' | 'panel' }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-3">
      {items.map(([label, value, color]) => (
        <div
          key={label}
          className={`flex items-baseline justify-between gap-3 rounded-lg border border-edge/70 px-3 py-2 sm:block sm:px-2 sm:py-2.5 sm:text-center ${
            tone === 'panel' ? 'bg-panel/70' : 'bg-void/40'
          }`}
        >
          <dt className="text-xs text-mute sm:text-[11px]">{label}</dt>
          <dd className="text-sm font-semibold tabular-nums sm:mt-0.5" style={color ? { color } : undefined}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** State for an amount box: the typed text and what it parses to (null if it isn't a number). */
function useAmount(initial: number | null | undefined, currency: string) {
  const [text, setText] = useState(initial != null && initial > 0 ? amountText(initial, currency) : '');
  return { text, setText, value: text.trim() === '' ? null : parseAmount(text, currency) };
}

export function AmountInput({
  amount,
  currency,
  label,
  autoFocus,
  large,
}: {
  amount: { text: string; setText(text: string): void };
  currency: string;
  label: string;
  autoFocus?: boolean;
  large?: boolean;
}) {
  const symbol = formatMoney(0, currency).replace(/[\d.,\s]/g, '') || currency;
  return (
    <div className="flex items-center gap-2">
      <span className={`shrink-0 font-semibold text-mute ${large ? 'text-xl' : 'text-sm'}`}>{symbol}</span>
      <input
        className={`${inputClass} ${large ? 'min-h-14 text-2xl font-semibold' : ''} tabular-nums`}
        inputMode="decimal"
        autoComplete="off"
        placeholder={CURRENCIES[currency]?.decimal === '.' ? '0.00' : '0,00'}
        aria-label={label}
        value={amount.text}
        onChange={(e) => amount.setText(e.target.value)}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function FormButtons({
  onClose,
  onDelete,
  valid,
  saveLabel,
}: {
  onClose(): void;
  onDelete?: () => void;
  valid: boolean;
  saveLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      {onDelete && (
        <Button variant="danger" onClick={onDelete}>
          <Trash2 size={16} /> Delete
        </Button>
      )}
      <span className="flex-1" />
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" disabled={!valid}>
        {saveLabel}
      </Button>
    </div>
  );
}

function Form({ onSubmit, children }: { onSubmit(): void; children: ReactNode }) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

const KIND_OPTIONS: { value: TxKind; label: string; color: string }[] = [
  { value: 'expense', label: 'Money out', color: 'var(--stat-str)' },
  { value: 'income', label: 'Money in', color: 'var(--stat-vit)' },
];

/** A select for linking money to a debt or a savings goal. Value is '', 'debt:<id>' or 'goal:<id>'. */
function LinkSelect({ value, onChange, debts, goals }: { value: string; onChange(v: string): void; debts: Debt[]; goals: Goal[] }) {
  if (debts.length === 0 && goals.length === 0) return null;
  return (
    <Field label="Counts towards">
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Nothing in particular</option>
        {debts.map((d) => (
          <option key={d.id} value={`debt:${d.id}`}>
            Paying off: {d.name}
          </option>
        ))}
        {goals.map((g) => (
          <option key={g.id} value={`goal:${g.id}`}>
            Saving for: {g.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

const linkOf = (x: { debtId: string | null; goalId: string | null } | undefined) =>
  x?.debtId ? `debt:${x.debtId}` : x?.goalId ? `goal:${x.goalId}` : '';
const unlink = (link: string) => ({
  debtId: link.startsWith('debt:') ? link.slice(5) : null,
  goalId: link.startsWith('goal:') ? link.slice(5) : null,
});

function usePlans() {
  const data = useGame((s) => s.data);
  return {
    // Debts that are already cleared aren't offered for new payments.
    debts: Object.values(data.debts).filter((d) => !d.deleted && debtRemaining(data, d) > 0),
    goals: Object.values(data.goals).filter((g) => !g.deleted),
  };
}

export function TransactionForm({
  tx,
  initial,
  onClose,
}: {
  tx?: Transaction;
  initial?: Partial<TxInput>;
  onClose(): void;
}) {
  const { data, today, currency } = useMoney();
  const saveTransaction = useGame((s) => s.saveTransaction);
  const deleteTransaction = useGame((s) => s.deleteTransaction);
  const { debts, goals } = usePlans();
  const from = tx ?? initial;

  const [kind, setKind] = useState<TxKind>(from?.kind ?? 'expense');
  const amount = useAmount(from?.amount, currency);
  const [category, setCategory] = useState(from?.category ?? defaultCategory(from?.kind ?? 'expense'));
  const [date, setDate] = useState(from?.date ?? today);
  const [note, setNote] = useState(from?.note ?? '');
  const [link, setLink] = useState(linkOf(from as { debtId: string | null; goalId: string | null } | undefined));

  const valid = amount.value !== null && amount.value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const beforeOpening = data.money !== null && valid && date < data.money.openingDate;

  const changeKind = (k: TxKind) => {
    setKind(k);
    setCategory(defaultCategory(k));
    if (k === 'income') setLink('');
  };
  const changeLink = (l: string) => {
    setLink(l);
    if (l.startsWith('debt:')) setCategory('debt');
    if (l.startsWith('goal:')) setCategory('savings');
  };

  const submit = () => {
    if (!valid) return;
    saveTransaction({ date, kind, amount: amount.value!, category, note, ...unlink(link) }, tx?.id);
    onClose();
  };

  return (
    <Modal title={tx ? 'Edit entry' : 'New entry'} onClose={onClose}>
      <Form onSubmit={submit}>
        <Segmented<TxKind> label="Direction" value={kind} onChange={changeKind} options={KIND_OPTIONS} />
        <AmountInput amount={amount} currency={currency} label="Amount" autoFocus={!tx} large />

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Category</span>
          <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {categoriesFor(kind).map((c) => {
              const on = c.id === category;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCategory(c.id)}
                  className={`min-h-10 rounded-lg border px-2 text-sm transition-colors ${
                    on ? 'border-glow bg-glow/15 font-medium text-ink' : 'border-edge bg-void/50 text-mute hover:text-ink'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {kind === 'expense' && <LinkSelect value={link} onChange={changeLink} debts={debts} goals={goals} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-mute">Date</span>
            <DateField value={date} onChange={setDate} label="Date" />
          </div>
          <Field label="Note (optional)">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Lunch with Ana" />
          </Field>
        </div>

        {beforeOpening && (
          <p className="text-xs text-mute">
            This is before your starting balance ({formatLong(data.money!.openingDate)}), so it is recorded but won’t
            change the balance.
          </p>
        )}

        <FormButtons
          onClose={onClose}
          valid={valid}
          saveLabel={tx ? 'Save changes' : 'Add'}
          onDelete={
            tx
              ? () => {
                  deleteTransaction(tx.id);
                  onClose();
                }
              : undefined
          }
        />
      </Form>
    </Modal>
  );
}

export function BalanceForm({ onClose }: { onClose(): void }) {
  const { data, today, currency, fmt } = useMoney();
  const correctBalance = useGame((s) => s.correctBalance);
  const current = balance(data, today);
  const amount = useAmount(current > 0 ? current : null, currency);
  const [negative, setNegative] = useState(current < 0);
  const typed = amount.value === null ? null : negative ? -amount.value : amount.value;
  const diff = typed === null ? 0 : typed - current;

  return (
    <Modal title="Correct the balance" onClose={onClose}>
      <Form
        onSubmit={() => {
          if (typed === null) return;
          correctBalance(typed);
          onClose();
        }}
      >
        <p className="text-sm text-mute">
          Type what your bank says you have right now. If it differs from {fmt(current)}, a single correction entry
          makes up the difference. It doesn’t count as spending.
        </p>
        <AmountInput amount={amount} currency={currency} label="Actual balance" autoFocus large />
        <label className="flex items-center gap-2 text-sm text-mute">
          <input type="checkbox" checked={negative} onChange={(e) => setNegative(e.target.checked)} className="size-4" />
          The account is overdrawn (negative balance)
        </label>
        {typed !== null && diff !== 0 && (
          <p className="text-sm">
            A correction of <strong>{fmt(Math.abs(diff))}</strong> will be {diff > 0 ? 'added' : 'taken off'}.
          </p>
        )}
        <FormButtons onClose={onClose} valid={typed !== null} saveLabel="Set balance" />
      </Form>
    </Modal>
  );
}

export function BudgetForm({ onClose }: { onClose(): void }) {
  const { data, currency } = useMoney();
  const updateMoney = useGame((s) => s.updateMoney);
  const amount = useAmount(data.money?.budget, currency);
  const valid = amount.value !== null && amount.value > 0;

  return (
    <Modal title="Monthly budget" onClose={onClose}>
      <Form
        onSubmit={() => {
          if (!valid) return;
          updateMoney({ budget: amount.value });
          onClose();
        }}
      >
        <p className="text-sm text-mute">
          The most you want to spend in a month. Debt payments and money put into savings don’t count against it. Each
          month that ends inside the budget earns +{BUDGET_REWARD.xp} Fortune XP and +{BUDGET_REWARD.gold} gold.
        </p>
        <AmountInput amount={amount} currency={currency} label="Monthly budget" autoFocus large />
        <FormButtons
          onClose={onClose}
          valid={valid}
          saveLabel="Save budget"
          onDelete={
            data.money?.budget != null
              ? () => {
                  updateMoney({ budget: null });
                  onClose();
                }
              : undefined
          }
        />
      </Form>
    </Modal>
  );
}

export function DebtForm({ debt, onClose }: { debt?: Debt; onClose(): void }) {
  const { currency } = useMoney();
  const saveDebt = useGame((s) => s.saveDebt);
  const deleteDebt = useGame((s) => s.deleteDebt);
  const [name, setName] = useState(debt?.name ?? '');
  const owed = useAmount(debt?.owed, currency);
  const [targetDate, setTargetDate] = useState(debt?.targetDate ?? '');
  const valid = name.trim() !== '' && owed.value !== null && owed.value > 0;

  return (
    <Modal title={debt ? 'Edit debt' : 'New debt'} onClose={onClose}>
      <Form
        onSubmit={() => {
          if (!valid) return;
          saveDebt({ name, owed: owed.value!, targetDate: targetDate || null }, debt?.id);
          onClose();
        }}
      >
        <Field label="What is it?">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Credit card" maxLength={60} autoFocus={!debt} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">
            {debt ? 'Total owed (before the payments recorded here)' : 'How much do you owe right now?'}
          </span>
          <AmountInput amount={owed} currency={currency} label="Amount owed" />
          {debt && <p className="mt-1.5 text-xs text-mute">Raise this if interest is added.</p>}
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Clear it by (optional)</span>
          <DateField value={targetDate} onChange={setTargetDate} label="Clear it by" placeholder="No date" clearable />
        </div>
        <FormButtons
          onClose={onClose}
          valid={valid}
          saveLabel={debt ? 'Save changes' : 'Add debt'}
          onDelete={
            debt
              ? () => {
                  deleteDebt(debt.id);
                  onClose();
                }
              : undefined
          }
        />
      </Form>
    </Modal>
  );
}

export function GoalForm({ goal, onClose }: { goal?: Goal; onClose(): void }) {
  const { currency } = useMoney();
  const saveGoal = useGame((s) => s.saveGoal);
  const deleteGoal = useGame((s) => s.deleteGoal);
  const [name, setName] = useState(goal?.name ?? '');
  const target = useAmount(goal?.target, currency);
  const saved = useAmount(goal?.saved, currency);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const valid = name.trim() !== '' && target.value !== null && target.value > 0 && (saved.text.trim() === '' || saved.value !== null);

  return (
    <Modal title={goal ? 'Edit goal' : 'New savings goal'} onClose={onClose}>
      <Form
        onSubmit={() => {
          if (!valid) return;
          saveGoal({ name, target: target.value!, saved: saved.value ?? 0, targetDate: targetDate || null }, goal?.id);
          onClose();
        }}
      >
        <Field label="What are you saving for?">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" maxLength={60} autoFocus={!goal} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Target amount</span>
          <AmountInput amount={target} currency={currency} label="Target amount" />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Already put aside (optional)</span>
          <AmountInput amount={saved} currency={currency} label="Already put aside" />
          <p className="mt-1.5 text-xs text-mute">
            Money you saved before, or keep aside without recording an entry. Entries marked “Saving for” this goal are
            added on top.
          </p>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Reach it by (optional)</span>
          <DateField value={targetDate} onChange={setTargetDate} label="Reach it by" placeholder="No date" clearable />
        </div>
        <FormButtons
          onClose={onClose}
          valid={valid}
          saveLabel={goal ? 'Save changes' : 'Add goal'}
          onDelete={
            goal
              ? () => {
                  deleteGoal(goal.id);
                  onClose();
                }
              : undefined
          }
        />
      </Form>
    </Modal>
  );
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function RecurringForm({ item, onClose }: { item?: Recurring; onClose(): void }) {
  const { today, currency } = useMoney();
  const saveRecurring = useGame((s) => s.saveRecurring);
  const deleteRecurring = useGame((s) => s.deleteRecurring);
  const { debts, goals } = usePlans();

  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<TxKind>(item?.kind ?? 'expense');
  const amount = useAmount(item?.amount, currency);
  const [category, setCategory] = useState(item?.category ?? 'bills');
  const [day, setDay] = useState(item?.day ?? Number(today.slice(8)));
  const [link, setLink] = useState(linkOf(item));
  const [endMonth, setEndMonth] = useState(item?.endMonth ?? '');
  // A new item whose day has already passed this month starts next month by default,
  // since this month's is most likely already in the balance.
  const thisMonth = monthOf(today);
  const [startMonth, setStartMonth] = useState(item?.startMonth ?? thisMonth);
  const [startTouched, setStartTouched] = useState(false);
  const suggestedStart = day < Number(today.slice(8)) ? addMonths(thisMonth, 1) : thisMonth;
  const start = item || startTouched ? startMonth : suggestedStart;

  const valid =
    name.trim() !== '' && amount.value !== null && amount.value > 0 && MONTH.test(start) && (endMonth === '' || (MONTH.test(endMonth) && endMonth >= start));

  return (
    <Modal title={item ? 'Edit monthly item' : 'New monthly item'} onClose={onClose}>
      <Form
        onSubmit={() => {
          if (!valid) return;
          saveRecurring(
            { name, kind, amount: amount.value!, category, day, startMonth: start, endMonth: endMonth || null, ...unlink(link) },
            item?.id,
          );
          onClose();
        }}
      >
        <Segmented<TxKind>
          label="Direction"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setCategory(k === 'expense' ? 'bills' : 'salary');
            if (k === 'income') setLink('');
          }}
          options={KIND_OPTIONS}
        />
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent, Salary, Loan instalment" maxLength={60} autoFocus={!item} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Amount each month</span>
          <AmountInput amount={amount} currency={currency} label="Amount each month" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoriesFor(kind).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Day of the month">
            <input
              type="number"
              min={1}
              max={31}
              className={inputClass}
              value={day}
              onChange={(e) => setDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
        </div>
        {kind === 'expense' && (
          <LinkSelect
            value={link}
            onChange={(l) => {
              setLink(l);
              if (l.startsWith('debt:')) setCategory('debt');
              if (l.startsWith('goal:')) setCategory('savings');
            }}
            debts={debts}
            goals={goals}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First month">
            <input
              type="month"
              className={inputClass}
              value={start}
              placeholder="YYYY-MM"
              onChange={(e) => {
                setStartMonth(e.target.value);
                setStartTouched(true);
              }}
            />
          </Field>
          <Field label="Last month (optional)">
            <input type="month" className={inputClass} value={endMonth} placeholder="YYYY-MM" onChange={(e) => setEndMonth(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-mute">
          It is added by itself on that day each month. Months that are already past when you save are added straight
          away.
        </p>
        <FormButtons
          onClose={onClose}
          valid={valid}
          saveLabel={item ? 'Save changes' : 'Add'}
          onDelete={
            item
              ? () => {
                  deleteRecurring(item.id);
                  onClose();
                }
              : undefined
          }
        />
      </Form>
    </Modal>
  );
}
