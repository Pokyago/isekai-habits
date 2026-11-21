import { ArrowRight, Check, Circle, Copy, GripVertical, Plus, Repeat, Target, Trash2, Wand2, X } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { BossCard, WeekGoalsPanel } from '../components/WeekBits';
import { Button, Panel, Segmented, inputBase } from '../components/ui';
import { useFx } from '../data/fx';
import { WEEKDAY_LABELS } from '../data/meta';
import { useGame } from '../data/store';
import type { DateStr } from '../data/types';
import { addDays, formatLong, formatShort, weekStart, weekday } from '../game/dates';
import { weekReview } from '../game/review';
import { dueHabits } from '../game/schedule';
import { useToday } from '../hooks';
import { formatMoney } from '../money/format';
import { mealsFor } from '../plan/meals';
import { moneyDue, planFor } from '../plan/plan';
import { WEEK_GOALS, WEEK_PLAN_DAYS, WEEK_PLAN_REWARD, isRepeated, repeats, weekGoals, weekPlan } from '../plan/week';
import { PlanWizard } from './PlanWizard';

/* What is being dragged between days: a goal ("item:<id>") or a quest ("quest:<id>"). */
const DRAG_TYPE = 'application/x-isekai-plan';
const startDrag = (kind: 'item' | 'quest', id: string) => (e: DragEvent) => {
  e.dataTransfer.setData(DRAG_TYPE, `${kind}:${id}`);
  e.dataTransfer.effectAllowed = 'move';
};

/**
 * A whole week at a glance, Monday to Sunday, for planning it in one sitting: the
 * goals for the week, a main goal for each day, and goals and quests spread over the
 * days, by dragging them or with the Move lists. "Plan my week" asks for the same
 * things one at a time. Planning a week before its Monday is over earns a small reward.
 */
export function PlanWeek({ onOpenDay }: { onOpenDay(date: DateStr): void }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  // From Friday on, the week to plan is the next one.
  const [which, setWhich] = useState<'this' | 'next'>(() => ([5, 6, 0].includes(weekday(today)) ? 'next' : 'this'));
  const week = which === 'this' ? weekStart(today) : addDays(weekStart(today), 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const plan = useMemo(() => weekPlan(data, week, today), [data, week, today]);
  const copyLastWeek = useGame((s) => s.copyLastWeek);
  const deleteRepeat = useGame((s) => s.deleteRepeat);
  const toast = useFx((s) => s.toast);
  const [guiding, setGuiding] = useState(false);
  const everyWeek = useMemo(() => repeats(data), [data]);
  // Whether the week before has a plan to start from.
  const before = addDays(week, -7);
  const canCopy = useMemo(
    () =>
      weekGoals(data, before).length > 0 ||
      Object.values(data.plan).some((p) => !p.deleted && !isRepeated(p) && p.date >= before && p.date <= addDays(before, 6)),
    [data, before],
  );
  const last = useMemo(() => weekReview(data, addDays(week, -7), today), [data, week, today]);
  const waiting = Object.values(data.quests)
    .filter((q) => !q.deleted && q.doneDate === null && !(q.plannedFor && q.plannedFor >= today))
    .sort((a, b) => a.createdAt - b.createdAt);

  const step = (ok: boolean, text: string) => (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-gold" /> : <Circle size={16} className="mt-0.5 shrink-0 text-mute" />}
      <span className={ok ? 'text-ink' : 'text-mute'}>{text}</span>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold lg:text-3xl">{which === 'this' ? 'This week' : 'Next week'}</h1>
          <p className="text-sm text-mute">
            {formatShort(week)} – {formatShort(addDays(week, 6))}
          </p>
        </div>
        <Button variant="gold" className="ml-auto" onClick={() => setGuiding(true)}>
          <Wand2 size={16} /> Plan my week
        </Button>
        <div className="w-full max-w-xs">
          <Segmented<'this' | 'next'>
            label="Week to plan"
            value={which}
            onChange={setWhich}
            options={[
              { value: 'this', label: 'This week' },
              { value: 'next', label: 'Next week' },
            ]}
          />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Panel title="Plan the week" right={plan.rewarded ? <span className="text-xs font-semibold text-gold">Planned</span> : undefined}>
          <ul className="space-y-1.5">
            {step(plan.goals.length > 0, `A goal for the week (${plan.goals.length} of up to ${WEEK_GOALS})`)}
            {step(plan.mainDays >= WEEK_PLAN_DAYS, `A main goal on at least ${WEEK_PLAN_DAYS} days (${plan.mainDays} of 7)`)}
          </ul>
          <p className="mt-3 text-xs text-mute">
            {plan.rewarded
              ? `Week planned: +${WEEK_PLAN_REWARD.xp} Focus XP and +${WEEK_PLAN_REWARD.gold} gold earned.`
              : plan.inTime
                ? `Do both before ${which === 'this' ? 'today is over' : 'Monday is over'} to earn +${WEEK_PLAN_REWARD.xp} Focus XP and +${WEEK_PLAN_REWARD.gold} gold.`
                : 'The reward is for a week planned by its Monday. This one can still be planned, and next week’s can earn it.'}
          </p>
          {canCopy && (
            <Button
              variant="ghost"
              className="mt-2 -ml-2 min-h-9 text-xs"
              onClick={() => toast(copyLastWeek(week) ? 'Copied the week before onto the same weekdays' : 'Everything from that week is already here', 'info')}
            >
              <Copy size={14} /> Start from the week before
            </Button>
          )}
          {last.due > 0 && (
            <p className="mt-3 border-t border-edge/60 pt-3 text-xs text-mute">
              The week before: <strong className="text-ink">{Math.round((last.share ?? 0) * 100)}%</strong> of habits kept,{' '}
              {last.flawless} flawless {last.flawless === 1 ? 'day' : 'days'}
              {last.habits[0] && last.habits[0].done < last.habits[0].due ? `. “${last.habits[0].name}” slipped most.` : '.'}
            </p>
          )}
        </Panel>
        <WeekGoalsPanel week={week} />
        <BossCard date={week} />
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-label="Days of the week">
        {days.map((date) => (
          <DayColumn key={date} date={date} days={days} onOpen={() => onOpenDay(date)} />
        ))}
      </ol>

      {waiting.length > 0 && (
        <Panel title="Quests not on a day yet" right={<span className="text-xs text-mute">{waiting.length}</span>}>
          <ul className="grid gap-2 md:grid-cols-2">
            {waiting.map((q) => (
              <li
                key={q.id}
                draggable
                onDragStart={startDrag('quest', q.id)}
                className="flex cursor-grab items-center gap-2 rounded-xl border border-edge bg-raise/70 py-1.5 pr-1.5 pl-1.5 active:cursor-grabbing"
              >
                <GripVertical size={14} className="shrink-0 text-mute/60" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{q.title}</span>
                <MoveTo label={`Put ${q.title} on a day`} text="Put on…" days={days} onPick={(d) => useGame.getState().planQuest(q.id, d)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {everyWeek.length > 0 && (
        <Panel title="Every week" right={<span className="text-xs text-mute">{everyWeek.length}</span>}>
          <ul className="grid gap-2 md:grid-cols-2">
            {everyWeek.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl border border-edge bg-raise/70 py-1 pr-1 pl-3">
                <Repeat size={14} className="shrink-0 text-mute" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.title}
                  <span className="text-xs text-mute">
                    {' '}
                    · every {new Date(2024, 0, 7 + r.weekday).toLocaleDateString(undefined, { weekday: 'long' })}
                    {r.time ? ` at ${r.time}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Stop repeating ${r.title}`}
                  title="Stop repeating"
                  onClick={() => deleteRepeat(r.id)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-mute hover:bg-void/60 hover:text-ink"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <p className="px-1 text-xs text-mute">
        Drag a goal or quest onto another day to move it, or use its Move list. “Plan my week” asks for everything one
        step at a time.
      </p>
      {guiding && <PlanWizard week={week} onClose={() => setGuiding(false)} />}
    </div>
  );
}

/** A small menu of the days that can still be planned. */
function MoveTo({ label, text, days, skip, onPick }: { label: string; text: string; days: DateStr[]; skip?: DateStr; onPick(date: DateStr): void }) {
  const today = useToday();
  const open = days.filter((d) => d >= today && d !== skip);
  if (open.length === 0) return null;
  return (
    <select
      className="h-8 shrink-0 cursor-pointer rounded-md border border-edge bg-void/60 px-1.5 text-xs text-mute hover:text-ink focus:border-glow focus:outline-none"
      aria-label={label}
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
    >
      <option value="">{text}</option>
      {open.map((d) => (
        <option key={d} value={d}>
          {d === today ? 'Today' : `${WEEKDAY_LABELS[weekday(d)]} ${Number(d.slice(8))}`}
        </option>
      ))}
    </select>
  );
}

function DayColumn({ date, days, onOpen }: { date: DateStr; days: DateStr[]; onOpen(): void }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const setMainGoal = useGame((s) => s.setMainGoal);
  const addPlanItem = useGame((s) => s.addPlanItem);
  const movePlanItem = useGame((s) => s.movePlanItem);
  const planQuest = useGame((s) => s.planQuest);

  const plan = useMemo(() => planFor(data, date), [data, date]);
  const habits = useMemo(() => dueHabits(data, date).filter((h) => h.schedule.kind === 'weekdays').length, [data, date]);
  const meals = useMemo(() => mealsFor(data, date).length, [data, date]);
  const money = useMemo(() => moneyDue(data, date).filter((m) => m.kind === 'expense' && !m.onCard), [data, date]);
  const past = date < today;
  const isToday = date === today;

  const stored = plan.main?.title ?? '';
  const [main, setMain] = useState(stored);
  // When the main goal changes elsewhere (moved here from another day, say), the box follows.
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setMain(stored);
  }
  const [title, setTitle] = useState('');
  const out = money.reduce((n, m) => n + m.amount, 0);
  // Something is being dragged over this day.
  const [over, setOver] = useState(false);

  return (
    <li
      onDragOver={(e) => {
        if (past || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const dropped = e.dataTransfer.getData(DRAG_TYPE);
        const cut = dropped.indexOf(':');
        if (past || cut < 0) return;
        e.preventDefault();
        const id = dropped.slice(cut + 1);
        if (dropped.startsWith('quest:')) planQuest(id, date);
        else movePlanItem(id, date);
      }}
      className={`flex min-w-0 flex-col rounded-xl border bg-panel/85 transition-colors ${
        over ? 'border-gold bg-gold/10' : isToday ? 'border-glow/60' : 'border-edge'
      } ${past ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={past}
        title={past ? undefined : `Open ${formatLong(date)}`}
        className="flex items-baseline justify-between gap-2 rounded-t-xl border-b border-edge/70 px-3 py-2 text-left transition-colors enabled:hover:bg-raise"
      >
        <span>
          <span className={`text-[11px] font-semibold tracking-wide uppercase ${isToday ? 'text-glow' : 'text-mute'}`}>
            {isToday ? 'Today' : WEEKDAY_LABELS[weekday(date)]}
          </span>{' '}
          <span className="font-display text-lg font-bold tabular-nums">{Number(date.slice(8))}</span>
        </span>
        {!past && <ArrowRight size={14} className="shrink-0 text-mute" aria-hidden />}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-gold uppercase">
            <Target size={11} /> Main goal
          </span>
          {plan.main?.done || past ? (
            <span className={`block text-sm leading-snug break-words ${plan.main?.done ? 'font-semibold text-gold' : 'text-mute'}`}>
              {plan.main?.title ?? 'None'}
            </span>
          ) : (
            <input
              className="min-h-9 w-full rounded-lg border border-gold/40 bg-gold/5 px-2 text-sm text-ink placeholder:text-mute/50 focus:border-gold focus:outline-none"
              value={main}
              onChange={(e) => setMain(e.target.value)}
              onBlur={() => setMainGoal(date, main)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setMain(stored);
                  e.currentTarget.blur();
                }
              }}
              placeholder="The one thing"
              aria-label={`Main goal for ${formatLong(date)}`}
              maxLength={120}
            />
          )}
        </label>

        {(plan.items.length > 0 || plan.quests.length > 0) && (
          <ul className="space-y-1">
            {plan.items.map((p) => (
              <li
                key={p.id}
                draggable={!p.done && !past}
                onDragStart={startDrag('item', p.id)}
                className={`flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 rounded-lg bg-raise/60 px-2 py-1.5 ${p.done || past ? '' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <span className={`min-w-24 flex-1 text-xs leading-snug break-words ${p.done ? 'text-mute line-through' : ''}`}>
                  {p.time && <strong className="mr-1 text-glow tabular-nums">{p.time}</strong>}
                  {p.title}
                  {isRepeated(p) && <Repeat size={10} className="ml-1 inline text-mute" aria-label="Every week" />}
                </span>
                {!p.done && !past && <MoveTo label={`Move ${p.title} to another day`} text="Move" days={days} skip={date} onPick={(d) => movePlanItem(p.id, d)} />}
              </li>
            ))}
            {plan.quests.map((q) => (
              <li
                key={q.id}
                draggable={!q.doneDate && !past}
                onDragStart={startDrag('quest', q.id)}
                className={`flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 rounded-lg bg-raise/60 px-2 py-1.5 ${q.doneDate || past ? '' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <span className={`min-w-24 flex-1 text-xs leading-snug break-words ${q.doneDate ? 'text-mute line-through' : ''}`}>
                  <span className="mr-1 text-[10px] text-mute uppercase">Quest</span>
                  {q.title}
                </span>
                {!q.doneDate && !past && (
                  <>
                    <MoveTo label={`Move ${q.title} to another day`} text="Move" days={days} skip={date} onPick={(d) => planQuest(q.id, d)} />
                    <button
                      type="button"
                      aria-label={`Take ${q.title} off this day`}
                      title="Take off this day"
                      onClick={() => planQuest(q.id, null)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-mute hover:bg-void/60 hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {!past && (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              addPlanItem(date, { title, time: null });
              setTitle('');
            }}
          >
            <input
              className={`${inputBase} min-h-8 min-w-0 flex-1 px-2 text-xs`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a goal"
              aria-label={`New goal for ${formatLong(date)}`}
              maxLength={100}
            />
            <Button variant="ghost" type="submit" className="min-h-8 px-2" disabled={!title.trim()} aria-label="Add">
              <Plus size={14} />
            </Button>
          </form>
        )}

        <p className="mt-auto pt-1 text-[11px] leading-relaxed text-mute tabular-nums">
          {[
            `${habits} ${habits === 1 ? 'habit' : 'habits'}`,
            meals > 0 && `${meals} ${meals === 1 ? 'meal' : 'meals'}`,
            plan.day?.wake && `up at ${plan.day.wake}`,
            out > 0 && data.money && `${formatMoney(out, data.money.currency)} due`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </li>
  );
}
