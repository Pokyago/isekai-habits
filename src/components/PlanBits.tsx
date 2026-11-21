import { Check, X } from 'lucide-react';
import { statColor } from '../data/meta';
import { useGame } from '../data/store';
import type { Meal, PlanItem } from '../data/types';
import { MEAL_STAT } from '../plan/meals';
import { PLAN_STAT } from '../plan/plan';
import { IconButton, inputBase } from './ui';

/** The box that ticks a planned goal off. Gold for the main goal. Locked until its day has come. */
export function PlanTick({ item, locked = false, size = 36 }: { item: PlanItem; locked?: boolean; size?: number }) {
  const togglePlanItem = useGame((s) => s.togglePlanItem);
  const color = item.main ? 'var(--color-gold)' : statColor(PLAN_STAT);
  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={item.done}
      aria-label={locked ? `${item.title}: can be ticked off on the day` : `${item.done ? 'Undo' : 'Tick off'} ${item.title}`}
      title={locked ? 'Can be ticked off on the day' : undefined}
      onClick={() => togglePlanItem(item.id)}
      className="flex shrink-0 items-center justify-center rounded-lg border-2 transition-transform enabled:hover:scale-105 disabled:opacity-35"
      style={{
        width: size,
        height: size,
        borderColor: color,
        background: item.done ? color : 'transparent',
        color: 'var(--color-void)',
      }}
    >
      {item.done && <Check size={size / 2} strokeWidth={3} className="animate-pop" />}
    </button>
  );
}

/** The box that ticks a meal as eaten as planned. */
export function MealTick({ meal, label, size = 30 }: { meal: Meal; label: string; size?: number }) {
  const toggleMeal = useGame((s) => s.toggleMeal);
  const color = statColor(MEAL_STAT);
  return (
    <button
      type="button"
      aria-pressed={meal.done}
      aria-label={`${label}, ${meal.text}: ${meal.done ? 'undo' : 'eaten as planned'}`}
      title={meal.done ? 'Undo' : 'Eaten as planned'}
      onClick={() => toggleMeal(meal.id)}
      className="flex shrink-0 items-center justify-center rounded-lg border-2 transition-transform hover:scale-105"
      style={{
        width: size,
        height: size,
        borderColor: color,
        background: meal.done ? color : 'transparent',
        color: 'var(--color-void)',
      }}
    >
      {meal.done && <Check size={size / 2} strokeWidth={3} className="animate-pop" />}
    </button>
  );
}

/** A clock time that can also be left empty. */
export function TimeInput({
  value,
  onChange,
  label,
  className = '',
}: {
  value: string | null;
  onChange(value: string | null): void;
  /** Says what the time is for, e.g. "Wake-up time". */
  label: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <input
        type="time"
        className={`${inputBase} min-w-0 flex-1`}
        value={value ?? ''}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
      {value && (
        <IconButton label={`Clear the ${label.toLowerCase()}`} onClick={() => onChange(null)}>
          <X size={16} />
        </IconButton>
      )}
    </span>
  );
}
