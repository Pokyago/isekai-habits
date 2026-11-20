import { Pencil, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Bar, Button, Empty, IconButton, Panel } from '../../components/ui';
import type { Debt, Goal, Recurring } from '../../data/types';
import { formatShort } from '../../game/dates';
import { MILESTONE_REWARD } from '../../money/actions';
import type { TxInput } from '../../money/actions';
import { debtPaid, debtRemaining, goalSaved, perMonthNeeded } from '../../money/calc';
import { categoryName } from '../../money/categories';
import { dayInMonth, formatMonth, monthOf } from '../../money/format';
import { DebtForm, GoalForm, RecurringForm, useMoney } from './forms';

function PlanCard({
  name,
  headline,
  value,
  max,
  color,
  lines,
  done,
  action,
  onEdit,
}: {
  name: string;
  headline: string;
  value: number;
  max: number;
  color: string;
  lines: string[];
  done: boolean;
  action?: ReactNode;
  onEdit?: () => void;
}) {
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${done ? 'border-gold/50 bg-gold/10' : 'border-edge bg-raise/60'}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className={`text-sm tabular-nums ${done ? 'font-semibold text-gold' : 'text-mute'}`}>{headline}</span>
          </p>
        </div>
        {action}
        {onEdit && (
          <IconButton label={`Edit ${name}`} onClick={onEdit}>
            <Pencil size={15} />
          </IconButton>
        )}
      </div>
      <Bar value={value} max={max} color={color} className="mt-2" />
      {lines.length > 0 && <p className="mt-1.5 text-xs text-mute">{lines.join(' · ')}</p>}
    </li>
  );
}

export function DebtList({ onPay, onEdit }: { onPay?: (prefill: Partial<TxInput>) => void; onEdit?: (debt: Debt) => void }) {
  const { data, today, fmt } = useMoney();
  const debts = Object.values(data.debts)
    .filter((d) => !d.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (debts.length === 0) return null;

  return (
    <ul className="space-y-2">
      {debts.map((d) => {
        const paid = debtPaid(data, d);
        const left = debtRemaining(data, d);
        const perMonth = perMonthNeeded(left, today, d.targetDate);
        const lines = [`${fmt(Math.min(paid, d.owed))} paid of ${fmt(d.owed)}`];
        if (left > 0 && d.targetDate) {
          lines.push(
            d.targetDate < today
              ? `was due ${formatShort(d.targetDate)}`
              : `${fmt(perMonth ?? left)} a month clears it by ${formatShort(d.targetDate)}`,
          );
        }
        return (
          <PlanCard
            key={d.id}
            name={d.name}
            headline={left === 0 ? 'Cleared' : `${fmt(left)} left`}
            value={Math.min(paid, d.owed)}
            max={d.owed}
            color="var(--stat-str)"
            lines={lines}
            done={left === 0}
            onEdit={onEdit ? () => onEdit(d) : undefined}
            action={
              left > 0 && onPay ? (
                <Button className="min-h-9" onClick={() => onPay({ kind: 'expense', category: 'debt', debtId: d.id, goalId: null, note: d.name, amount: perMonth ? Math.min(perMonth, left) : undefined })}>
                  Pay
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </ul>
  );
}

export function GoalList({ onSave, onEdit }: { onSave?: (prefill: Partial<TxInput>) => void; onEdit?: (goal: Goal) => void }) {
  const { data, today, fmt } = useMoney();
  const goals = Object.values(data.goals)
    .filter((g) => !g.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (goals.length === 0) return null;

  return (
    <ul className="space-y-2">
      {goals.map((g) => {
        const saved = goalSaved(data, g);
        const left = Math.max(0, g.target - saved);
        const perMonth = perMonthNeeded(left, today, g.targetDate);
        const lines = [`${fmt(saved)} of ${fmt(g.target)}`];
        if (left > 0 && g.targetDate) {
          lines.push(
            g.targetDate < today
              ? `target date was ${formatShort(g.targetDate)}`
              : `${fmt(perMonth ?? left)} a month gets there by ${formatShort(g.targetDate)}`,
          );
        }
        return (
          <PlanCard
            key={g.id}
            name={g.name}
            headline={left === 0 ? 'Reached' : `${Math.floor((saved / g.target) * 100)}%`}
            value={saved}
            max={g.target}
            color="var(--stat-vit)"
            lines={lines}
            done={left === 0}
            onEdit={onEdit ? () => onEdit(g) : undefined}
            action={
              left > 0 && onSave ? (
                <Button className="min-h-9" onClick={() => onSave({ kind: 'expense', category: 'savings', goalId: g.id, debtId: null, note: g.name, amount: perMonth ? Math.min(perMonth, left) : undefined })}>
                  Add
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </ul>
  );
}

export function Plans({ onAdd }: { onAdd(prefill: Partial<TxInput>): void }) {
  const { data, today, fmt } = useMoney();
  const [debt, setDebt] = useState<Debt | 'new' | null>(null);
  const [goal, setGoal] = useState<Goal | 'new' | null>(null);
  const [item, setItem] = useState<Recurring | 'new' | null>(null);

  const hasDebts = Object.values(data.debts).some((d) => !d.deleted);
  const hasGoals = Object.values(data.goals).some((g) => !g.deleted);
  const recurring = Object.values(data.recurring)
    .filter((r) => !r.deleted)
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  const thisMonth = monthOf(today);
  const addButton = (label: string, onClick: () => void) => (
    <Button variant="ghost" className="-mr-2 min-h-8" onClick={onClick}>
      <Plus size={16} /> {label}
    </Button>
  );

  return (
    <div className="space-y-4">
      <Panel title="Debts" right={addButton('Add', () => setDebt('new'))}>
        <p className="mb-3 text-sm text-mute">
          What you owe and how fast it is going down. Record a payment with “Pay”. Clearing a debt earns +
          {MILESTONE_REWARD.xp} Fortune XP and +{MILESTONE_REWARD.gold} gold.
        </p>
        {hasDebts ? <DebtList onPay={onAdd} onEdit={setDebt} /> : <Empty>No debts recorded.</Empty>}
      </Panel>

      <Panel title="Savings goals" right={addButton('Add', () => setGoal('new'))}>
        <p className="mb-3 text-sm text-mute">
          Something to save towards. “Add” records money you moved out of the account for it. Reaching a goal earns +
          {MILESTONE_REWARD.xp} Fortune XP and +{MILESTONE_REWARD.gold} gold.
        </p>
        {hasGoals ? <GoalList onSave={onAdd} onEdit={setGoal} /> : <Empty>No savings goals yet.</Empty>}
      </Panel>

      <Panel title="Every month" right={addButton('Add', () => setItem('new'))}>
        <p className="mb-3 text-sm text-mute">Rent, salary, subscriptions, instalments: added by themselves on their day.</p>
        {recurring.length === 0 ? (
          <Empty>Nothing set to repeat.</Empty>
        ) : (
          <ul className="space-y-1">
            {recurring.map((r) => {
              const ended = r.endMonth !== null && r.endMonth < thisMonth;
              const notStarted = r.startMonth > thisMonth;
              const when = ended
                ? `ended ${formatMonth(r.endMonth!)}`
                : notStarted
                  ? `starts ${formatShort(dayInMonth(r.startMonth, r.day))}`
                  : `day ${r.day}${r.endMonth ? ` · until ${formatMonth(r.endMonth)}` : ''}`;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setItem(r)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-raise ${ended ? 'opacity-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.name}</span>
                      <span className="block truncate text-[11px] text-mute">
                        {categoryName(r.category)} · {when}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums" style={r.kind === 'income' ? { color: 'var(--stat-vit)' } : undefined}>
                      {r.kind === 'income' ? '+' : '−'}
                      {fmt(r.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {debt && <DebtForm debt={debt === 'new' ? undefined : debt} onClose={() => setDebt(null)} />}
      {goal && <GoalForm goal={goal === 'new' ? undefined : goal} onClose={() => setGoal(null)} />}
      {item && <RecurringForm item={item === 'new' ? undefined : item} onClose={() => setItem(null)} />}
    </div>
  );
}
