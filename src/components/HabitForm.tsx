import { useState } from 'react';
import type { HabitInput } from '../data/actions';
import { HABIT_CATEGORIES, habitCategory } from '../data/habitCategories';
import { categoryOf } from '../data/templates';
import { DIFFICULTIES, DIFFICULTY_ORDER, STATS, STAT_ORDER, WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS, statColor } from '../data/meta';
import type { Difficulty, Habit, StatKey } from '../data/types';
import { BASE_XP } from '../game/xp';
import { Button, Field, Modal, Segmented, StatIcon, inputBase, inputClass } from './ui';

export function HabitForm({
  habit,
  initialCategory,
  onSave,
  onClose,
}: {
  habit?: Habit;
  /** For a new habit: the category to start on. */
  initialCategory?: string;
  onSave(input: HabitInput): void;
  onClose(): void;
}) {
  const [name, setName] = useState(habit?.name ?? '');
  const [category, setCategory] = useState(habit ? categoryOf(habit) : (initialCategory ?? 'exercise'));
  const [stat, setStat] = useState<StatKey>(habit?.stat ?? habitCategory(initialCategory ?? 'exercise').stat);
  const [difficulty, setDifficulty] = useState<Difficulty>(habit?.difficulty ?? 'easy');
  const [kind, setKind] = useState<'weekdays' | 'perWeek'>(habit?.schedule.kind ?? 'weekdays');
  const [days, setDays] = useState<number[]>(
    habit?.schedule.kind === 'weekdays' ? habit.schedule.days : [0, 1, 2, 3, 4, 5, 6],
  );
  const [times, setTimes] = useState(habit?.schedule.kind === 'perWeek' ? habit.schedule.times : 3);
  const [target, setTarget] = useState(habit?.target ?? 1);
  const [why, setWhy] = useState(habit?.why ?? '');

  const valid = name.trim().length > 0 && (kind === 'perWeek' || days.length > 0);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const submit = () => {
    if (!valid) return;
    onSave({
      name,
      category,
      stat,
      difficulty,
      schedule: kind === 'weekdays' ? { kind, days } : { kind, times },
      target,
      why,
    });
    onClose();
  };

  return (
    <Modal title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Read for 20 minutes"
            maxLength={80}
            autoFocus={!habit}
          />
        </Field>

        <Field label="Why do you want this? (optional)">
          <input
            className={inputClass}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="e.g. To have energy in the afternoon"
            maxLength={140}
          />
        </Field>

        <Field label="Category">
          <select
            className={inputClass}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              // Each category has a natural stat; "Other" leaves the choice alone.
              if (e.target.value !== 'other') setStat(habitCategory(e.target.value).stat);
            }}
          >
            {HABIT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Stat it trains</span>
          <div role="radiogroup" aria-label="Stat" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {STAT_ORDER.map((s) => {
              const on = s === stat;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStat(s)}
                  className={`flex min-h-12 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors ${
                    on ? 'text-ink' : 'border-edge bg-void/50 text-mute hover:text-ink'
                  }`}
                  style={
                    on
                      ? { borderColor: statColor(s), background: `color-mix(in srgb, ${statColor(s)} 14%, transparent)` }
                      : undefined
                  }
                >
                  <StatIcon stat={s} size={18} />
                  <span className="min-w-0">
                    <span className="block text-sm leading-tight font-medium">{STATS[s].name}</span>
                    <span className="block truncate text-[11px] leading-tight text-mute">{STATS[s].blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Difficulty</span>
          <Segmented<Difficulty>
            label="Difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTY_ORDER.map((d) => ({
              value: d,
              label: (
                <span className="flex flex-col py-1 leading-tight">
                  {DIFFICULTIES[d].name}
                  <span className="text-[11px] font-normal text-mute">{BASE_XP[d]} XP</span>
                </span>
              ),
            }))}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Schedule</span>
          <Segmented<'weekdays' | 'perWeek'>
            label="Schedule type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'weekdays', label: 'On set days' },
              { value: 'perWeek', label: 'Times per week' },
            ]}
          />
          {kind === 'weekdays' ? (
            <div className="mt-2 flex gap-1.5" role="group" aria-label="Days of the week">
              {WEEKDAY_DISPLAY_ORDER.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    className={`min-h-10 flex-1 rounded-lg border text-xs font-medium transition-colors ${
                      on ? 'border-glow bg-glow/15 text-ink' : 'border-edge bg-void/50 text-mute'
                    }`}
                  >
                    {WEEKDAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-sm text-mute">
              <input
                type="number"
                min={1}
                max={7}
                aria-label="Times per week"
                className={`${inputBase} w-20`}
                value={times}
                onChange={(e) => setTimes(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
              />
              times a week, on any days
            </div>
          )}
        </div>

        <Field label="Times per day to count as done">
          <input
            type="number"
            min={1}
            max={99}
            className={`${inputBase} w-24`}
            value={target}
            onChange={(e) => setTarget(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {habit ? 'Save changes' : 'Add habit'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
