import { Ban, Check, Flame, Plus, Undo2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Chip, Empty, Panel, StatIcon } from '../components/ui';
import { categoryIndex, habitCategory } from '../data/habitCategories';
import { DIFFICULTIES, STATS, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { categoryOf } from '../data/templates';
import type { DateStr, Habit, PlanItem } from '../data/types';
import { formatShort } from '../game/dates';
import { isActiveOn, isDone, isScheduledOn, scheduleLabel, weekCount } from '../game/schedule';
import { BASE_XP } from '../game/xp';
import { useDerived } from '../hooks';
import { GOAL_IDEAS } from '../plan/ideas';
import { habitChoices } from '../plan/plan';

const byCategoryThenName = (a: Habit, b: Habit) =>
  categoryIndex(categoryOf(a)) - categoryIndex(categoryOf(b)) || a.name.localeCompare(b.name);

/**
 * A card that is chosen by clicking anywhere on it, like a habit card on Today.
 * The round button does the same for the keyboard.
 */
function PickCard({
  title,
  label,
  selected,
  faded = false,
  color,
  icon,
  chips,
  note,
  action,
  onToggle,
  delay = 0,
}: {
  title: string;
  /** What clicking does, for screen readers. */
  label: string;
  selected: boolean;
  /** Shown dimmed and struck through: a habit skipped for the day. */
  faded?: boolean;
  color: string;
  icon: ReactNode;
  chips?: ReactNode;
  /** A line under the chips: the reason for a habit, to read before skipping it. */
  note?: string;
  /** A second control on the right, e.g. Skip. */
  action?: ReactNode;
  onToggle(): void;
  delay?: number;
}) {
  return (
    <div
      onClick={onToggle}
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-rise group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,transform,box-shadow,opacity] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${
        selected ? 'border-gold/70 bg-gold/10' : faded ? 'border-edge/50 bg-void/40 opacity-60' : 'border-edge bg-raise/70 hover:border-mute'
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-transform duration-200 group-hover:scale-105 active:scale-90"
        style={{
          borderColor: selected ? 'var(--color-gold)' : color,
          background: selected ? 'var(--color-gold)' : 'transparent',
          color: selected ? 'var(--color-void)' : color,
        }}
      >
        {/* Re-keyed so the tick pops each time the card is chosen. */}
        {selected ? <Check key="on" size={20} strokeWidth={3} className="animate-pop" /> : icon}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`line-clamp-2 text-sm leading-snug font-medium break-words ${faded ? 'text-mute line-through' : ''}`}>{title}</p>
        {chips && <div className="mt-1 flex flex-wrap gap-1.5">{chips}</div>}
        {note && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-mute">“{note}”</p>}
      </div>
      {action && (
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {action}
        </span>
      )}
    </div>
  );
}

const grid = 'grid gap-2 md:grid-cols-2 3xl:grid-cols-3';
const heading = 'mb-2 px-1 text-[11px] font-semibold tracking-wide text-mute uppercase';

/**
 * The day's habits as cards. Click one to make it a priority for the day, skip one
 * that can't happen, or add a habit that isn't usually on that day.
 */
export function HabitBoard({ date, isToday }: { date: DateStr; isToday: boolean }) {
  const data = useGame((s) => s.data);
  const setHabitChoice = useGame((s) => s.setHabitChoice);
  const derived = useDerived();
  const [adding, setAdding] = useState(false);

  const choices = useMemo(() => habitChoices(data, date), [data, date]);
  const active = useMemo(
    () => Object.values(data.habits).filter((h) => isActiveOn(h, date)).sort(byCategoryThenName),
    [data, date],
  );
  const onDay = active.filter((h) => h.schedule.kind === 'weekdays' && (isScheduledOn(h, date) || choices.get(h.id) === 'extra'));
  const weekly = active.filter((h) => h.schedule.kind === 'perWeek');
  const others = active.filter((h) => h.schedule.kind === 'weekdays' && !isScheduledOn(h, date) && choices.get(h.id) !== 'extra');

  const picked = [...choices.values()].filter((c) => c === 'pick' || c === 'extra').length;
  const skipped = [...choices.values()].filter((c) => c === 'skip').length;

  const groups: { id: string; habits: Habit[] }[] = [];
  for (const h of onDay) {
    const id = categoryOf(h);
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.habits.push(h);
    else groups.push({ id, habits: [h] });
  }

  const streakChip = (h: Habit) => {
    const streak = derived.streaks[h.id]?.current ?? 0;
    return streak > 0 ? (
      <Chip color="var(--color-gold)">
        <Flame size={11} />
        {streak}
      </Chip>
    ) : null;
  };

  let position = 0;
  const nextDelay = () => Math.min(position++ * 30, 360);

  return (
    <Panel
      title="Habits for the day"
      right={
        picked + skipped > 0 ? (
          <span className="text-xs text-mute tabular-nums">
            {[picked > 0 && `${picked} picked`, skipped > 0 && `${skipped} skipped`].filter(Boolean).join(' · ')}
          </span>
        ) : undefined
      }
    >
      <p className="mb-4 text-sm text-mute">
        Click a habit to make it a priority: it then leads the list on Today. Skip one that can’t happen that day and
        its streak is kept.
      </p>

      {active.length === 0 ? (
        <Empty>No habits yet. Add some on the Habits page.</Empty>
      ) : (
        <div className="space-y-5">
          {groups.length === 0 && <Empty>No habits are scheduled on this day.</Empty>}
          {groups.map((g) => (
            <section key={g.id}>
              <h3 className={heading}>{habitCategory(g.id).name}</h3>
              <div className={grid}>
                {g.habits.map((h) => {
                  const choice = choices.get(h.id) ?? null;
                  const extra = choice === 'extra';
                  const isPicked = choice === 'pick' || extra;
                  const isSkipped = choice === 'skip';
                  const done = isDone(data, h.id, date);
                  return (
                    <PickCard
                      key={h.id}
                      title={h.name}
                      label={
                        isSkipped
                          ? `${h.name} is skipped. Put it back`
                          : extra
                            ? `Take ${h.name} off this day`
                            : `${isPicked ? 'Unpick' : 'Pick'} ${h.name}`
                      }
                      selected={isPicked}
                      faded={isSkipped}
                      color={statColor(h.stat)}
                      icon={<StatIcon stat={h.stat} size={18} />}
                      note={h.why}
                      delay={nextDelay()}
                      onToggle={() => setHabitChoice(h.id, date, isPicked || isSkipped ? null : 'pick')}
                      chips={
                        <>
                          {isSkipped ? (
                            <Chip>Skipped · streak kept</Chip>
                          ) : (
                            <>
                              <Chip>{DIFFICULTIES[h.difficulty].name}</Chip>
                              <Chip>{extra ? 'Just this day' : scheduleLabel(h.schedule)}</Chip>
                              {streakChip(h)}
                              {isToday && done && <Chip color="var(--stat-vit)">Done</Chip>}
                            </>
                          )}
                        </>
                      }
                      action={
                        extra || (isToday && done) ? undefined : isSkipped ? (
                          <Button variant="ghost" className="min-h-9 px-2.5 text-xs" onClick={() => setHabitChoice(h.id, date, null)}>
                            <Undo2 size={14} /> Undo
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="min-h-9 px-2.5 text-xs"
                            aria-label={`Skip ${h.name} on this day`}
                            onClick={() => setHabitChoice(h.id, date, 'skip')}
                          >
                            <Ban size={14} /> Skip
                          </Button>
                        )
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {weekly.length > 0 && (
            <section>
              <h3 className={heading}>Any day this week · click to do it on this day</h3>
              <div className={grid}>
                {weekly.map((h) => {
                  const isPicked = choices.get(h.id) === 'pick';
                  const times = h.schedule.kind === 'perWeek' ? h.schedule.times : 0;
                  return (
                    <PickCard
                      key={h.id}
                      title={h.name}
                      label={`${isPicked ? 'Unpick' : 'Pick'} ${h.name}`}
                      selected={isPicked}
                      color={statColor(h.stat)}
                      icon={<StatIcon stat={h.stat} size={18} />}
                      delay={nextDelay()}
                      onToggle={() => setHabitChoice(h.id, date, isPicked ? null : 'pick')}
                      chips={
                        <>
                          <Chip>{DIFFICULTIES[h.difficulty].name}</Chip>
                          <Chip>
                            {Math.min(times, weekCount(data, h.id, date))} of {times} this week
                          </Chip>
                          {streakChip(h)}
                        </>
                      }
                    />
                  );
                })}
              </div>
            </section>
          )}

          {others.length > 0 && (
            <section>
              {adding ? (
                <>
                  <h3 className={heading}>Not usually on this day · click to add it for this day only</h3>
                  <div className={grid}>
                    {others.map((h) => (
                      <PickCard
                        key={h.id}
                        title={h.name}
                        label={`Add ${h.name} for this day only`}
                        selected={false}
                        color={statColor(h.stat)}
                        icon={<Plus size={18} />}
                        onToggle={() => setHabitChoice(h.id, date, 'extra')}
                        chips={
                          <>
                            <Chip>{habitCategory(categoryOf(h)).name}</Chip>
                            <Chip>{scheduleLabel(h.schedule)}</Chip>
                          </>
                        }
                      />
                    ))}
                  </div>
                  <Button variant="ghost" className="mt-2" onClick={() => setAdding(false)}>
                    Hide these
                  </Button>
                </>
              ) : (
                <Button onClick={() => setAdding(true)}>
                  <Plus size={16} /> Add a habit for this day only ({others.length})
                </Button>
              )}
            </section>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Open one-off tasks from the quest log. Click one to put it on this day's plan. */
export function QuestBoard({ date }: { date: DateStr }) {
  const quests = useGame((s) => s.data.quests);
  const planQuest = useGame((s) => s.planQuest);
  const open = useMemo(
    () =>
      Object.values(quests)
        .filter((q) => !q.deleted && q.doneDate === null)
        .sort((a, b) => Number(b.plannedFor === date) - Number(a.plannedFor === date) || a.createdAt - b.createdAt),
    [quests, date],
  );
  const here = open.filter((q) => q.plannedFor === date).length;

  return (
    <Panel title="From your quest log" right={here > 0 ? <span className="text-xs text-mute">{here} picked</span> : undefined}>
      {open.length === 0 ? (
        <Empty>No open quests. One-off tasks added to the quest log on Today can be picked here.</Empty>
      ) : (
        <div className={grid}>
          {open.map((q, i) => {
            const selected = q.plannedFor === date;
            return (
              <PickCard
                key={q.id}
                title={q.title}
                label={`${selected ? 'Take' : 'Put'} ${q.title} ${selected ? 'off' : 'on'} this day`}
                selected={selected}
                color={statColor(q.stat)}
                icon={<StatIcon stat={q.stat} size={18} />}
                delay={Math.min(i * 30, 300)}
                onToggle={() => planQuest(q.id, selected ? null : date)}
                chips={
                  <>
                    <Chip color={statColor(q.stat)}>{STATS[q.stat].short}</Chip>
                    <Chip>
                      {DIFFICULTIES[q.difficulty].name} · +{BASE_XP[q.difficulty]} XP
                    </Chip>
                    {q.plannedFor && !selected && <Chip>Planned for {formatShort(q.plannedFor)}</Chip>}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/** Common goals to click instead of typing. Each one becomes a goal on the day; click again to take it off. */
export function IdeaBoard({ date, items }: { date: DateStr; items: PlanItem[] }) {
  const addPlanItem = useGame((s) => s.addPlanItem);
  const deletePlanItem = useGame((s) => s.deletePlanItem);
  const byTitle = new Map(items.map((p) => [p.title, p]));

  return (
    <Panel title="Goal ideas">
      <p className="mb-4 text-sm text-mute">Click any of these to add it to the day’s goals. Click again to take it off.</p>
      <div className="space-y-4">
        {GOAL_IDEAS.map((g) => (
          <section key={g.area}>
            <h3 className={heading}>{g.area}</h3>
            <div className="flex flex-wrap gap-2">
              {g.ideas.map((idea) => {
                const item = byTitle.get(idea);
                const on = item !== undefined;
                return (
                  <button
                    key={idea}
                    type="button"
                    aria-pressed={on}
                    // One that has been ticked off stays: it has earned its XP.
                    disabled={item?.done}
                    onClick={() => (item ? deletePlanItem(item.id) : addPlanItem(date, { title: idea, time: null }))}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
                      on ? 'border-gold/70 bg-gold/15 text-ink' : 'border-edge bg-raise/70 text-mute hover:border-mute hover:text-ink'
                    }`}
                  >
                    {on && <Check size={14} strokeWidth={3} className="animate-pop text-gold" />}
                    {idea}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
