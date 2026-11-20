import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, Button, Empty, Field, Panel, Segmented, inputClass } from '../../components/ui';
import { useGame } from '../../data/store';
import type { Transaction } from '../../data/types';
import { daysBetween } from '../../game/dates';
import { BUDGET_REWARD, LEDGER_REWARD } from '../../money/actions';
import type { TxInput } from '../../money/actions';
import { activeTransactions, balance, budgetStatus, monthSummary } from '../../money/calc';
import { categoryName } from '../../money/categories';
import { CURRENCIES, DEFAULT_CURRENCY, formatMonth, monthOf, parseAmount } from '../../money/format';
import { subscriptionTotals, upcomingCharges } from '../../money/subscriptions';
import { AmountInput, BalanceForm, BudgetForm, Stats, TransactionForm, useMoney } from './forms';
import { DebtList, GoalList, Plans } from './Plans';
import { Subscriptions, inDays } from './Subscriptions';
import { Transactions, TxRow } from './Transactions';

type View = 'overview' | 'entries' | 'plans' | 'subs';

export function Money() {
  const hasMoney = useGame((s) => s.data.money !== null);
  const [view, setView] = useState<View>('overview');
  // What the entry form is showing: a new entry (maybe prefilled), an existing one, or nothing.
  const [form, setForm] = useState<{ tx?: Transaction; initial?: Partial<TxInput> } | null>(null);

  if (!hasMoney) return <Setup />;

  const add = (initial: Partial<TxInput> = {}) => setForm({ initial });
  const edit = (tx: Transaction) => setForm({ tx });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Money</h1>
        <Button variant="gold" onClick={() => add()}>
          <Plus size={16} /> Add entry
        </Button>
      </div>
      <Segmented<View>
        label="Money section"
        value={view}
        onChange={setView}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'entries', label: 'Entries' },
          { value: 'plans', label: 'Debts & goals' },
          { value: 'subs', label: 'Subscriptions' },
        ]}
      />

      {view === 'overview' && (
        <Overview onAdd={add} onEdit={edit} onSeeAll={() => setView('entries')} onSeeSubs={() => setView('subs')} />
      )}
      {view === 'entries' && <Transactions onEdit={edit} />}
      {view === 'plans' && <Plans onAdd={add} />}
      {view === 'subs' && <Subscriptions />}

      {form && <TransactionForm tx={form.tx} initial={form.initial} onClose={() => setForm(null)} />}
    </div>
  );
}

function Setup() {
  const setupMoney = useGame((s) => s.setupMoney);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [balanceText, setBalanceText] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const opening = balanceText.trim() === '' ? null : parseAmount(balanceText, currency);
  const budget = budgetText.trim() === '' ? null : parseAmount(budgetText, currency);
  const valid = opening !== null && (budgetText.trim() === '' || (budget !== null && budget > 0));

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Money</h1>
      <Panel title="Set up money tracking">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setupMoney(opening!, budget, currency);
          }}
        >
          <p className="text-sm text-mute">
            Record what you spend and earn, and always know what is in your bank account. Your money records are kept
            only in your own save file, with the rest of your game.
          </p>
          <Field label="Currency">
            <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {Object.entries(CURRENCIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-mute">How much is in your bank account right now?</span>
            <AmountInput amount={{ text: balanceText, setText: setBalanceText }} currency={currency} label="Current bank balance" large />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-mute">Monthly spending budget (optional)</span>
            <AmountInput amount={{ text: budgetText, setText: setBudgetText }} currency={currency} label="Monthly budget" />
          </div>
          <p className="text-xs text-mute">
            In the game: +{LEDGER_REWARD.xp} Fortune XP and +{LEDGER_REWARD.gold} gold the first time you record
            something each day, and +{BUDGET_REWARD.xp} XP and +{BUDGET_REWARD.gold} gold for every month that ends
            inside your budget.
          </p>
          <Button variant="gold" type="submit" disabled={!valid}>
            Start tracking
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function Overview({
  onAdd,
  onEdit,
  onSeeAll,
  onSeeSubs,
}: {
  onAdd(initial?: Partial<TxInput>): void;
  onEdit(tx: Transaction): void;
  onSeeAll(): void;
  onSeeSubs(): void;
}) {
  const { data, today, fmt } = useMoney();
  const [correcting, setCorrecting] = useState(false);
  const [budgeting, setBudgeting] = useState(false);

  const month = monthOf(today);
  const total = useMemo(() => balance(data, today), [data, today]);
  const summary = useMemo(() => monthSummary(data, month), [data, month]);
  const budget = useMemo(() => budgetStatus(data, today), [data, today]);
  const recent = useMemo(
    () =>
      activeTransactions(data)
        .filter((t) => t.date <= today)
        .sort((a, b) => (a.date === b.date ? b.updatedAt - a.updatedAt : a.date < b.date ? 1 : -1))
        .slice(0, 5),
    [data, today],
  );
  const hasDebts = Object.values(data.debts).some((d) => !d.deleted);
  const hasGoals = Object.values(data.goals).some((g) => !g.deleted);
  const subs = useMemo(() => subscriptionTotals(data), [data]);
  // Charges coming up in the next two weeks, at most three.
  const dueSoon = useMemo(
    () => upcomingCharges(data, today).filter((u) => daysBetween(today, u.date) <= 14).slice(0, 3),
    [data, today],
  );
  const net = summary.income - summary.out;
  const top = summary.byCategory[0]?.amount ?? 0;

  return (
    <div className="space-y-4">
      <Panel
        title="In the bank"
        right={
          <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => setCorrecting(true)}>
            Correct
          </Button>
        }
      >
        <p className={`font-display text-4xl font-bold tabular-nums ${total < 0 ? 'text-danger' : ''}`}>{fmt(total)}</p>
        <div className="mt-4">
          <Stats
            items={[
              ['In this month', fmt(summary.income), 'var(--stat-vit)'],
              ['Out this month', fmt(summary.out)],
              ['Difference', `${net < 0 ? '−' : '+'}${fmt(Math.abs(net))}`, net < 0 ? 'var(--color-danger)' : 'var(--stat-vit)'],
            ]}
          />
        </div>
      </Panel>

      <Panel
        title={`Budget · ${formatMonth(month)}`}
        right={
          budget ? (
            <Button variant="ghost" className="-mr-2 min-h-8" onClick={() => setBudgeting(true)}>
              Change
            </Button>
          ) : undefined
        }
      >
        {budget ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={`font-display text-2xl font-bold tabular-nums ${budget.left < 0 ? 'text-danger' : ''}`}>
                {budget.left < 0 ? `${fmt(-budget.left)} over` : `${fmt(budget.left)} left`}
              </span>
              <span className="text-xs text-mute tabular-nums">
                {fmt(budget.spent)} of {fmt(budget.budget)}
              </span>
            </div>
            <Bar value={budget.spent} max={budget.budget} color={budget.left < 0 ? 'var(--color-danger)' : 'var(--color-gold)'} className="h-3" />
            <p className="mt-2 text-xs text-mute">
              {budget.left > 0
                ? `${budget.daysLeft} ${budget.daysLeft === 1 ? 'day' : 'days'} left in the month: about ${fmt(budget.perDay)} a day.`
                : 'The budget for this month is used up.'}{' '}
              Debt payments and savings don’t count.
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-48 flex-1 text-sm text-mute">
              Set a monthly spending limit. Each month that ends inside it earns +{BUDGET_REWARD.xp} Fortune XP and +
              {BUDGET_REWARD.gold} gold.
            </p>
            <Button variant="primary" onClick={() => setBudgeting(true)}>
              Set a budget
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Where it went this month">
        {summary.byCategory.length === 0 ? (
          <Empty>No spending recorded this month yet.</Empty>
        ) : (
          <ul className="space-y-2.5">
            {summary.byCategory.map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span>{categoryName(c.category)}</span>
                  <span className="text-mute tabular-nums">
                    {fmt(c.amount)} · {Math.round((c.amount / summary.out) * 100)}%
                  </span>
                </div>
                <Bar value={c.amount} max={top} color="var(--stat-foc)" className="h-1.5" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {(hasDebts || hasGoals) && (
        <Panel title="Debts & goals">
          <div className="space-y-2">
            <DebtList onPay={onAdd} />
            <GoalList onSave={onAdd} />
          </div>
        </Panel>
      )}

      {subs.count > 0 && (
        <Panel
          title="Subscriptions"
          right={
            <Button variant="ghost" className="-mr-2 min-h-8" onClick={onSeeSubs}>
              See all
            </Button>
          }
        >
          <p className="text-sm">
            <strong className="tabular-nums">{fmt(subs.perMonth)}</strong> a month across {subs.count}{' '}
            {subs.count === 1 ? 'subscription' : 'subscriptions'}.
          </p>
          {dueSoon.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {dueSoon.map(({ sub, date }) => (
                <li key={sub.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {sub.name} <span className="text-xs text-mute">{inDays(daysBetween(today, date))}</span>
                  </span>
                  <span className="shrink-0 text-mute tabular-nums">{fmt(sub.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel
        title="Latest entries"
        right={
          recent.length > 0 ? (
            <Button variant="ghost" className="-mr-2 min-h-8" onClick={onSeeAll}>
              See all
            </Button>
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <div className="text-center">
            <Empty>Nothing recorded yet.</Empty>
            <Button variant="primary" onClick={() => onAdd()}>
              <Plus size={16} /> Add your first entry
            </Button>
          </div>
        ) : (
          recent.map((t) => <TxRow key={t.id} tx={t} onEdit={onEdit} />)
        )}
      </Panel>

      {correcting && <BalanceForm onClose={() => setCorrecting(false)} />}
      {budgeting && <BudgetForm onClose={() => setBudgeting(false)} />}
    </div>
  );
}
