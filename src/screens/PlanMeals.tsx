import { Copy, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MealTick } from '../components/PlanBits';
import { Button, IconButton, Panel, inputBase } from '../components/ui';
import { useGame } from '../data/store';
import type { DateStr, Meal, MealSlot } from '../data/types';
import { addDays, parseDate } from '../game/dates';
import { useToday } from '../hooks';
import { MEAL_SLOTS, mealId, mealIdeas, mealReward, mealsFor } from '../plan/meals';

/**
 * What to eat on a day, one line for each meal. Clicking into a meal offers the
 * ones planned for it before, so a usual meal is one click.
 */
export function MealBoard({ date, canTick }: { date: DateStr; canTick: boolean }) {
  const data = useGame((s) => s.data);
  const copyMeals = useGame((s) => s.copyMeals);
  const today = useToday();
  // The meal whose suggestions are showing: the one last clicked into.
  const [open, setOpen] = useState<MealSlot | null>(null);
  const planned = useMemo(() => mealsFor(data, date), [data, date]);
  const before = addDays(date, -1);
  const toCopy = useMemo(
    () => mealsFor(data, before).filter((m) => !planned.some((p) => p.slot === m.slot)).length,
    [data, before, planned],
  );
  const reward = mealReward(data);
  const eaten = planned.filter((m) => m.done).length;
  const beforeName =
    before === today
      ? 'today'
      : before === addDays(today, -1)
        ? 'yesterday'
        : before === addDays(today, 1)
          ? 'tomorrow'
          : parseDate(before).toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <Panel
      title="Meals"
      right={
        planned.length > 0 ? (
          <span className="text-xs text-mute tabular-nums">{canTick ? `${eaten}/${planned.length} eaten` : `${planned.length} planned`}</span>
        ) : undefined
      }
    >
      <ul className="space-y-3">
        {MEAL_SLOTS.map((s) => (
          <MealRow
            key={s.slot}
            date={date}
            slot={s.slot}
            label={s.label}
            placeholder={s.placeholder}
            meal={data.meals[mealId(date, s.slot)] ?? null}
            canTick={canTick}
            open={open === s.slot}
            onOpen={() => setOpen(s.slot)}
            onClose={() => setOpen(null)}
          />
        ))}
      </ul>
      {toCopy > 0 && (
        <Button className="mt-3 w-full" onClick={() => copyMeals(before, date)}>
          <Copy size={16} /> {planned.length === 0 ? `Same as ${beforeName}` : `Fill the rest from ${beforeName}`}
        </Button>
      )}
      <p className="mt-3 text-xs text-mute">
        Each meal you eat as planned earns +{reward.xp} Vitality XP and +{reward.gold} gold.
        {canTick ? ' A meal that went differently costs nothing.' : ' Tick them off on the day.'}
      </p>
    </Panel>
  );
}

function MealRow({
  date,
  slot,
  label,
  placeholder,
  meal,
  canTick,
  open,
  onOpen,
  onClose,
}: {
  date: DateStr;
  slot: MealSlot;
  label: string;
  placeholder: string;
  meal: Meal | null;
  canTick: boolean;
  open: boolean;
  onOpen(): void;
  /** Puts the suggestions away, once one has been picked. */
  onClose(): void;
}) {
  const data = useGame((s) => s.data);
  const setMeal = useGame((s) => s.setMeal);
  const stored = meal?.text ?? '';
  const [text, setText] = useState(stored);
  // When the saved meal changes from outside (a suggestion, a copied day, a sync), the box follows.
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setText(stored);
  }

  const ideas = useMemo(() => (open ? mealIdeas(data, slot) : []), [open, data, slot]);
  const typed = text.trim().toLowerCase();
  // While something new is being typed, only the suggestions that match it are offered.
  const narrowing = typed !== stored.toLowerCase();
  const shown = ideas.filter((i) => i.toLowerCase() !== typed && (!narrowing || i.toLowerCase().includes(typed)));
  const inputId = `meal-${slot}`;

  return (
    <li>
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-mute">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {canTick &&
          (meal && stored ? (
            <MealTick meal={meal} label={label} size={36} />
          ) : (
            <span className="size-9 shrink-0 rounded-lg border-2 border-dashed border-edge/70" aria-hidden />
          ))}
        <input
          id={inputId}
          className={`${inputBase} min-w-0 flex-1 ${meal?.done ? 'text-mute line-through' : ''}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onOpen();
          }}
          onFocus={onOpen}
          onBlur={() => setMeal(date, slot, text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(stored);
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          maxLength={120}
          autoComplete="off"
        />
        {stored && (
          <IconButton label={`Clear ${label.toLowerCase()}`} onClick={() => setMeal(date, slot, '')}>
            <X size={16} />
          </IconButton>
        )}
      </div>
      {open && shown.length > 0 && (
        <div className="animate-fade mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${label} suggestions`}>
          {shown.map((idea) => (
            <button
              key={idea}
              type="button"
              // Keeps the typing box in focus, so a half-typed word isn't saved before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText(idea);
                setMeal(date, slot, idea);
                onClose();
              }}
              className="inline-flex min-h-8 items-center rounded-full border border-edge bg-raise/70 px-2.5 text-xs text-mute transition-colors hover:border-mute hover:text-ink"
            >
              {idea}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
