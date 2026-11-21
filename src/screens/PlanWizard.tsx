import { ArrowLeft, ArrowRight, Check, Copy, Plus, Repeat, Target, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { TimeInput } from '../components/PlanBits';
import { BossArt, WeekGoalsPanel } from '../components/WeekBits';
import { Button, Modal, inputBase } from '../components/ui';
import { useFx } from '../data/fx';
import { useGame } from '../data/store';
import type { DateStr } from '../data/types';
import { bossFor } from '../game/boss';
import { addDays, formatLong, formatShort, parseDate, weekday } from '../game/dates';
import { weekReview } from '../game/review';
import { dueHabits } from '../game/schedule';
import { useToday } from '../hooks';
import { formatMoney } from '../money/format';
import { GOAL_IDEAS } from '../plan/ideas';
import { moneyDue, planFor, unfinishedBefore } from '../plan/plan';
import { WEEK_PLAN_DAYS, WEEK_PLAN_REWARD, isRepeated, weekGoals, weekPlan } from '../plan/week';

const dayWord = (date: DateStr) => parseDate(date).toLocaleDateString(undefined, { weekday: 'long' });

/** A suggestion to click instead of typing. Chosen ones are filled in and can be clicked again to undo. */
function Pick({ on = false, disabled = false, onClick, children }: { on?: boolean; disabled?: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-left text-xs transition-colors disabled:opacity-50 ${
        on ? 'border-gold/70 bg-gold/15 text-ink' : 'border-edge bg-raise/70 text-mute hover:border-mute hover:text-ink'
      }`}
    >
      {on && <Check size={12} strokeWidth={3} className="shrink-0 text-gold" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

const label = 'mb-1.5 block text-[10px] font-semibold tracking-wide text-mute uppercase';

/**
 * Planning a week one question at a time: a look back, the goals for the week, then
 * each day in turn, then a summary. Everything is saved as it is chosen, so it can be
 * closed at any point and nothing is lost.
 */
export function PlanWizard({ week, onClose }: { week: DateStr; onClose(): void }) {
  const today = useToday();
  const steps = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d) => d >= today);
    return ['back', 'goals', ...days, 'done'];
  }, [week, today]);
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  const isDay = step !== 'back' && step !== 'goals' && step !== 'done';
  const title = step === 'back' ? 'First, a look back' : step === 'goals' ? 'Goals for the week' : step === 'done' ? 'Your week' : formatLong(step);

  return (
    <Modal title="Plan my week" onClose={onClose}>
      <ol className="mb-3 flex gap-1" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              onClick={() => setAt(i)}
              aria-current={i === at ? 'step' : undefined}
              aria-label={`Step ${i + 1} of ${steps.length}`}
              className={`block h-1.5 w-full rounded-full transition-colors ${i === at ? 'bg-glow' : i < at ? 'bg-gold' : 'bg-edge hover:bg-mute'}`}
            />
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-mute">
        Step {at + 1} of {steps.length}
      </p>
      <h3 className="mb-4 font-display text-2xl leading-tight font-bold">{title}</h3>

      <div key={step} className="animate-fade">
        {step === 'back' && <LookBack week={week} />}
        {step === 'goals' && <WeekGoalsPanel week={week} />}
        {isDay && <DayStep date={step} week={week} />}
        {step === 'done' && <Summary week={week} />}
      </div>

      {/* Kept in view at the bottom of the dialog, however long the step is. */}
      <div className="sticky bottom-0 -mx-4 mt-5 -mb-4 flex items-center gap-2 border-t border-edge/70 bg-panel px-4 py-3">
        {at > 0 && (
          <Button variant="ghost" onClick={() => setAt(at - 1)}>
            <ArrowLeft size={16} /> Back
          </Button>
        )}
        <span className="flex-1" />
        {step === 'done' ? (
          <Button variant="gold" onClick={onClose}>
            <Check size={16} /> Done
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setAt(at + 1)}>
            {at === steps.length - 2 ? 'See the week' : 'Next'} <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </Modal>
  );
}

function LookBack({ week }: { week: DateStr }) {
  const data = useGame((s) => s.data);
  const copyLastWeek = useGame((s) => s.copyLastWeek);
  const toast = useFx((s) => s.toast);
  const today = useToday();
  const before = addDays(week, -7);
  const last = useMemo(() => weekReview(data, before, today), [data, before, today]);
  const boss = useMemo(() => bossFor(data, before, today), [data, before, today]);
  const leftover = useMemo(() => unfinishedBefore(data, today), [data, today]);
  const slipped = last.habits.filter((h) => h.done < h.due).slice(0, 3);
  const running = before <= today && addDays(before, 6) >= today;
  // Whether the week before has a plan worth starting from.
  const hasPlan = useMemo(
    () =>
      weekGoals(data, before).length > 0 ||
      Object.values(data.plan).some((p) => !p.deleted && !isRepeated(p) && p.date >= before && p.date <= addDays(before, 6)),
    [data, before],
  );

  return (
    <div className="space-y-4">
      {last.due === 0 ? (
        <p className="text-sm text-mute">There is no week to look back on yet. This is the first one.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Habits kept', `${Math.round((last.share ?? 0) * 100)}%`],
              ['Flawless days', String(last.flawless)],
              ['Weekly boss', boss ? (boss.defeated ? 'Beaten' : running ? `${boss.hp} HP` : 'Got away') : '–'],
            ].map(([name, value]) => (
              <div key={name} className="rounded-lg border border-edge/70 bg-void/40 px-2 py-2.5">
                <dt className="text-[11px] text-mute">{name}</dt>
                <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-mute">
            {running ? 'This week so far' : 'The week before'}, {formatShort(before)} – {formatShort(addDays(before, 6))}.
          </p>
          {slipped.length > 0 && (
            <div>
              <span className={label}>Slipped most</span>
              <ul className="space-y-1 text-sm">
                {slipped.map((h) => (
                  <li key={h.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{h.name}</span>
                    <span className="shrink-0 text-mute tabular-nums">
                      {h.done}/{h.due}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-mute">One of these could be a goal for the week.</p>
            </div>
          )}
        </>
      )}
      {boss && !boss.defeated && running && (
        <p className="flex items-center gap-3 rounded-lg border border-edge/70 bg-void/40 px-3 py-2 text-xs text-mute">
          <BossArt kind={boss.kind} defeated={false} className="size-10 shrink-0" />
          {boss.name} still has {boss.hp} of {boss.maxHp} HP, with {boss.daysLeft} {boss.daysLeft === 1 ? 'day' : 'days'} to go.
        </p>
      )}
      {leftover.length > 0 && (
        <p className="text-sm">
          <strong>{leftover.length}</strong> {leftover.length === 1 ? 'thing was' : 'things were'} planned and not
          finished. You can put {leftover.length === 1 ? 'it' : 'them'} on a day in the next steps.
        </p>
      )}
      {hasPlan && (
        <div className="rounded-lg border border-edge/70 bg-void/40 p-3">
          <p className="mb-2 text-sm">Is this week much like that one?</p>
          <Button
            onClick={() =>
              toast(copyLastWeek(week) ? 'Copied: change what is different in the next steps' : 'Everything from that week is already here', 'info')
            }
          >
            <Copy size={16} /> Start from that week’s plan
          </Button>
          <p className="mt-2 text-xs text-mute">
            Copies its main goals, goals and goals for the week onto the same weekdays. What you already planned stays.
          </p>
        </div>
      )}
    </div>
  );
}

function DayStep({ date, week }: { date: DateStr; week: DateStr }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const setMainGoal = useGame((s) => s.setMainGoal);
  const addPlanItem = useGame((s) => s.addPlanItem);
  const deletePlanItem = useGame((s) => s.deletePlanItem);
  const movePlanItem = useGame((s) => s.movePlanItem);
  const planQuest = useGame((s) => s.planQuest);
  const addRepeat = useGame((s) => s.addRepeat);

  const plan = useMemo(() => planFor(data, date), [data, date]);
  const goals = useMemo(() => weekGoals(data, week).filter((g) => !g.done), [data, week]);
  const leftover = useMemo(() => unfinishedBefore(data, today), [data, today]);
  const waiting = Object.values(data.quests)
    .filter((q) => !q.deleted && q.doneDate === null && !(q.plannedFor && q.plannedFor >= today && q.plannedFor !== date))
    .sort((a, b) => a.createdAt - b.createdAt);
  const habits = useMemo(() => dueHabits(data, date).filter((h) => h.schedule.kind === 'weekdays').length, [data, date]);
  const bills = useMemo(() => moneyDue(data, date).filter((m) => m.kind === 'expense' && !m.onCard), [data, date]);

  const stored = plan.main?.title ?? '';
  const [main, setMain] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setMain(stored);
  }
  const [title, setTitle] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [everyWeek, setEveryWeek] = useState(false);
  const [moreIdeas, setMoreIdeas] = useState(false);
  const byTitle = new Map(plan.items.map((p) => [p.title, p]));
  const locked = plan.main?.done ?? false;
  const pickMain = (text: string) => {
    setMain(text);
    setMainGoal(date, text);
  };

  return (
    <div className="space-y-5">
      <section>
        <span className={`${label} flex items-center gap-1 text-gold`}>
          <Target size={12} /> The one thing that would make {dayWord(date)} a success
        </span>
        <input
          className="min-h-11 w-full rounded-lg border border-gold/40 bg-gold/5 px-3 text-base text-ink placeholder:text-mute/50 focus:border-gold focus:outline-none disabled:opacity-60"
          value={main}
          disabled={locked}
          onChange={(e) => setMain(e.target.value)}
          onBlur={() => setMainGoal(date, main)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Type it, or pick one below. It can stay empty."
          aria-label={`Main goal for ${formatLong(date)}`}
          maxLength={120}
          autoFocus
        />
        {!locked && (goals.length > 0 || leftover.some((p) => p.main)) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {goals.map((g) => (
              <Pick key={g.id} on={stored === g.title} onClick={() => pickMain(stored === g.title ? '' : g.title)}>
                {g.title}
              </Pick>
            ))}
            {leftover
              .filter((p) => p.main)
              .map((p) => (
                <Pick key={p.id} onClick={() => movePlanItem(p.id, date)}>
                  {p.title} <span className="opacity-60">· from {formatShort(p.date)}</span>
                </Pick>
              ))}
          </div>
        )}
      </section>

      <section>
        <span className={label}>Also on {dayWord(date)}</span>
        {plan.items.length + plan.quests.length > 0 && (
          <ul className="mb-2 space-y-1">
            {plan.items.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-edge bg-raise/60 py-1 pr-1 pl-3 text-sm">
                {p.time && <strong className="shrink-0 text-glow tabular-nums">{p.time}</strong>}
                <span className="min-w-0 flex-1 break-words">{p.title}</span>
                {isRepeated(p) && <Repeat size={13} className="shrink-0 text-mute" aria-label="Every week" />}
                <button
                  type="button"
                  aria-label={`Take ${p.title} off ${dayWord(date)}`}
                  onClick={() => deletePlanItem(p.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-mute hover:bg-void/60 hover:text-ink"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
            {plan.quests.map((q) => (
              <li key={q.id} className="flex items-center gap-2 rounded-lg border border-edge bg-raise/60 py-1 pr-1 pl-3 text-sm">
                <span className="shrink-0 text-[10px] text-mute uppercase">Quest</span>
                <span className="min-w-0 flex-1 break-words">{q.title}</span>
                <button
                  type="button"
                  aria-label={`Take ${q.title} off ${dayWord(date)}`}
                  onClick={() => planQuest(q.id, null)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-mute hover:bg-void/60 hover:text-ink"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            if (everyWeek) addRepeat({ title, weekday: weekday(date), time });
            else addPlanItem(date, { title, time });
            setTitle('');
            setTime(null);
            setEveryWeek(false);
          }}
        >
          <input
            className={`${inputBase} min-w-40 flex-[3]`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A goal or appointment"
            aria-label={`New goal for ${formatLong(date)}`}
            maxLength={100}
          />
          <TimeInput value={time} onChange={setTime} label="Time, optional" className="w-32" />
          <Button variant="primary" type="submit" disabled={!title.trim()}>
            <Plus size={16} /> Add
          </Button>
          <label className="flex w-full items-center gap-2 text-xs text-mute">
            <input type="checkbox" className="size-4" checked={everyWeek} onChange={(e) => setEveryWeek(e.target.checked)} />
            Put it on every {dayWord(date)} from now on
          </label>
        </form>

        {leftover.some((p) => !p.main) && (
          <div className="mt-3">
            <span className={label}>Not finished yet: click to move here</span>
            <div className="flex flex-wrap gap-1.5">
              {leftover
                .filter((p) => !p.main)
                .map((p) => (
                  <Pick key={p.id} onClick={() => movePlanItem(p.id, date)}>
                    {p.title} <span className="opacity-60">· from {formatShort(p.date)}</span>
                  </Pick>
                ))}
            </div>
          </div>
        )}
        {waiting.length > 0 && (
          <div className="mt-3">
            <span className={label}>From your quest log</span>
            <div className="flex flex-wrap gap-1.5">
              {waiting.map((q) => {
                const on = q.plannedFor === date;
                return (
                  <Pick key={q.id} on={on} onClick={() => planQuest(q.id, on ? null : date)}>
                    {q.title}
                  </Pick>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-3">
          <button type="button" className="text-xs text-glow underline-offset-2 hover:underline" aria-expanded={moreIdeas} onClick={() => setMoreIdeas(!moreIdeas)}>
            {moreIdeas ? 'Hide the ideas' : 'Show ready-made ideas to click'}
          </button>
          {moreIdeas && (
            <div className="mt-2 space-y-2.5">
              {GOAL_IDEAS.map((g) => (
                <div key={g.area}>
                  <span className={label}>{g.area}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {g.ideas.map((idea) => {
                      const item = byTitle.get(idea);
                      return (
                        <Pick
                          key={idea}
                          on={item !== undefined}
                          disabled={item?.done}
                          onClick={() => (item ? deletePlanItem(item.id) : addPlanItem(date, { title: idea, time: null }))}
                        >
                          {idea}
                        </Pick>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="border-t border-edge/60 pt-3 text-xs text-mute tabular-nums">
        Already on this day: {habits} {habits === 1 ? 'habit' : 'habits'}
        {bills.length > 0 && data.money && `, and ${formatMoney(bills.reduce((n, m) => n + m.amount, 0), data.money.currency)} to pay (${bills.map((b) => b.name).join(', ')})`}
        .
      </p>
    </div>
  );
}

function Summary({ week }: { week: DateStr }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const plan = useMemo(() => weekPlan(data, week, today), [data, week, today]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  return (
    <div className="space-y-4">
      {plan.goals.length > 0 && (
        <div>
          <span className={label}>Goals for the week</span>
          <ul className="space-y-1 text-sm">
            {plan.goals.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <Target size={13} className="shrink-0 text-gold" />
                <span className="min-w-0 break-words">{g.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <span className={label}>Day by day</span>
        <ul className="divide-y divide-edge/50 text-sm">
          {days.map((d) => {
            const p = planFor(data, d);
            const more = p.items.length + p.quests.length;
            return (
              <li key={d} className={`flex items-baseline gap-3 py-1.5 ${d < today ? 'opacity-50' : ''}`}>
                <span className="w-10 shrink-0 text-xs font-semibold text-mute">{parseDate(d).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span className={`min-w-0 flex-1 break-words ${p.main ? '' : 'text-mute'}`}>{p.main?.title ?? 'No main goal'}</span>
                {more > 0 && <span className="shrink-0 text-xs text-mute tabular-nums">+{more} more</span>}
              </li>
            );
          })}
        </ul>
      </div>
      <p className={`rounded-lg border px-3 py-2 text-sm ${plan.rewarded ? 'border-gold/60 bg-gold/10 text-gold' : 'border-edge/70 bg-void/40 text-mute'}`}>
        {plan.rewarded
          ? `Week planned: +${WEEK_PLAN_REWARD.xp} Focus XP and +${WEEK_PLAN_REWARD.gold} gold earned.`
          : !plan.ready
            ? `For the planning reward, a week needs a goal for the week (${plan.goals.length} so far) and a main goal on at least ${WEEK_PLAN_DAYS} days (${plan.mainDays} so far).`
            : 'This week was planned after its Monday, so there is no reward this time. Next week’s can earn it.'}
      </p>
    </div>
  );
}
