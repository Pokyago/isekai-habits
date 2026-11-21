import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PlanTick, TimeInput } from '../components/PlanBits';
import { Button, Field, IconButton, Panel, inputBase, inputClass } from '../components/ui';
import { WEEKDAY_LABELS } from '../data/meta';
import { useGame } from '../data/store';
import type { DateStr, DayPlan, PlanItem } from '../data/types';
import { addDays, formatLong, formatShort, parseDate, weekday } from '../game/dates';
import { dueHabits } from '../game/schedule';
import { averageSleep, formatSleep, sleepLogs } from '../health/health';
import { useToday } from '../hooks';
import { formatMoney } from '../money/format';
import { mealsFor } from '../plan/meals';
import {
  PLAN_AHEAD_REWARD,
  REWARDED_GOALS,
  goalReward,
  hoursAsleep,
  mainReward,
  moneyDue,
  nextGoalReward,
  planFor,
  planProgress,
  shiftTime,
  unfinishedBefore,
} from '../plan/plan';
import { HabitBoard, IdeaBoard, QuestBoard } from './PlanBoards';
import { MealBoard } from './PlanMeals';

/** How many days can be planned: today and the six after it. */
const DAYS = 7;

function dayName(offset: number, date: DateStr): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return parseDate(date).toLocaleDateString(undefined, { weekday: 'long' });
}

/**
 * Plan a day before it starts. On the left, things to choose from by clicking, as
 * on Today: the day's habits, open quests and ready-made goals. On the right, what
 * has been written down: goals and appointments, meals, when to get up, and a note.
 * It opens on tomorrow; any of the next days can be picked.
 */
export function Plan({ startOn = 1 }: { startOn?: number }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const [offset, setOffset] = useState(startOn);
  const date = addDays(today, offset);
  const name = dayName(offset, date);

  const plan = useMemo(() => planFor(data, date), [data, date]);
  const progress = planProgress(data, date);
  const habits = useMemo(() => dueHabits(data, date).filter((h) => h.schedule.kind === 'weekdays').length, [data, date]);
  // Things left over are those whose day has already come: never the plans for days still ahead.
  const leftoverBefore = offset <= 1 ? date : addDays(today, 1);
  const leftover = useMemo(() => unfinishedBefore(data, leftoverBefore), [data, leftoverBefore]);
  const canTick = offset === 0;
  const meals = useMemo(() => mealsFor(data, date).length, [data, date]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div key={date} className="animate-fade">
          <h1 className="font-display text-2xl font-bold lg:text-3xl">{name}</h1>
          <p className="text-sm text-mute">
            {formatLong(date)} · {progress.total === 0 ? 'nothing planned yet' : `${progress.total} planned`} · {habits}{' '}
            {habits === 1 ? 'habit' : 'habits'} scheduled
            {meals > 0 && ` · ${meals} ${meals === 1 ? 'meal' : 'meals'}`}
          </p>
        </div>

        <div className="grid w-full max-w-xl grid-cols-7 gap-1.5" role="group" aria-label="Day to plan">
          {Array.from({ length: DAYS }, (_, i) => {
            const d = addDays(today, i);
            const p = planProgress(data, d);
            const on = i === offset;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={`${dayName(i, d)}, ${formatLong(d)}: ${p.total === 0 ? 'nothing planned' : `${p.total} planned`}`}
                title={formatLong(d)}
                onClick={() => setOffset(i)}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] transition-colors ${
                  on ? 'border-glow bg-glow/10 text-ink' : 'border-edge/60 text-mute hover:border-mute hover:text-ink'
                }`}
              >
                <span>{i === 0 ? 'Today' : WEEKDAY_LABELS[weekday(d)]}</span>
                <span className="font-display text-base leading-tight font-bold text-ink tabular-nums">{Number(d.slice(8))}</span>
                <span
                  className={`h-1 w-5 rounded-full ${p.total === 0 ? 'bg-edge/60' : p.done === p.total ? 'bg-gold' : 'bg-glow'}`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start xl:gap-6 xl:space-y-0">
        <div className="space-y-4">
          {/* Keyed by date, so what is being typed for one day doesn't carry over to another. */}
          <MainGoal key={`main|${date}`} date={date} main={plan.main} canTick={canTick} tomorrow={offset === 1} />
          <HabitBoard key={`habits|${date}`} date={date} isToday={offset === 0} />
          <QuestBoard date={date} />
          <IdeaBoard date={date} items={plan.items} />
        </div>

        {/* On a wide window this column stays in view while the boards scroll. */}
        <aside className="space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1">
          <Goals key={`goals|${date}`} date={date} items={plan.items} canTick={canTick} />
          {leftover.length > 0 && <Leftover items={leftover} date={date} name={name} />}
          <MealBoard key={`meals|${date}`} date={date} canTick={canTick} />
          <DayFrame key={`frame|${date}`} date={date} day={plan.day} />
          <MoneyOnDay date={date} />
          <Note key={`note|${date}`} date={date} note={plan.day?.note ?? ''} />
        </aside>
      </div>
    </div>
  );
}

function MainGoal({ date, main, canTick, tomorrow }: { date: DateStr; main: PlanItem | null; canTick: boolean; tomorrow: boolean }) {
  const data = useGame((s) => s.data);
  const setMainGoal = useGame((s) => s.setMainGoal);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(main?.title ?? '');
  const showForm = !main || editing;
  const reward = mainReward(data);
  const planBonus = tomorrow && !data.claims[`plan|${date}`];

  return (
    <Panel title="Main goal" right={main?.done ? <span className="text-xs font-semibold text-gold">Achieved</span> : undefined}>
      {showForm ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setMainGoal(date, text);
            setEditing(false);
          }}
        >
          <input
            className={`${inputBase} min-h-12 min-w-56 flex-1 text-base`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="The one thing that would make this day a success"
            aria-label="Main goal"
            maxLength={120}
            autoFocus={editing}
          />
          <Button variant="gold" type="submit" className="min-h-12" disabled={!text.trim()}>
            {main ? 'Save' : 'Set goal'}
          </Button>
          {main && (
            <Button
              variant="ghost"
              className="min-h-12"
              onClick={() => {
                setText(main.title);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <div
          // Re-keyed when it is achieved, so the pulse plays once at that moment.
          key={String(main.done)}
          // On a narrow screen the two buttons drop to a line of their own, so the goal keeps its width.
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-3 ${
            main.done ? 'animate-goal border-gold/70 bg-gold/10' : 'border-gold/40 bg-gold/5'
          }`}
        >
          <PlanTick item={main} locked={!canTick} size={44} />
          <p className={`min-w-40 flex-1 font-display text-lg leading-snug font-bold break-words sm:text-xl ${main.done ? 'text-gold' : ''}`}>
            {main.title}
          </p>
          {!main.done && (
            <span className="ml-auto flex">
              <IconButton label="Reword the main goal" onClick={() => setEditing(true)}>
                <Pencil size={16} />
              </IconButton>
              <IconButton
                label="Remove the main goal"
                onClick={() => {
                  setMainGoal(date, '');
                  setText('');
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            </span>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-mute">
        {main?.done
          ? `Achieved: +${main.xp} Focus XP and +${main.gold} gold.`
          : `${planBonus ? `Setting it today, the day before, earns +${PLAN_AHEAD_REWARD.xp} Focus XP. ` : ''}Achieving it earns +${reward.xp} Focus XP and +${reward.gold} gold.${
              main && !canTick ? ' It can be ticked off once the day comes.' : ''
            }`}
      </p>
    </Panel>
  );
}

function Goals({ date, items, canTick }: { date: DateStr; items: PlanItem[]; canTick: boolean }) {
  const data = useGame((s) => s.data);
  const addPlanItem = useGame((s) => s.addPlanItem);
  const deletePlanItem = useGame((s) => s.deletePlanItem);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const next = nextGoalReward(data, date);
  const each = goalReward(data);
  const done = items.filter((p) => p.done).length;

  return (
    <Panel
      title="Goals and appointments"
      right={items.length > 0 ? <span className="text-xs text-mute tabular-nums">{canTick ? `${done}/${items.length} done` : items.length}</span> : undefined}
    >
      {items.length > 0 && (
        <ul className="mb-3 space-y-2">
          {items.map((p) =>
            p.id === editId ? (
              <li key={p.id}>
                <EditGoal item={p} onDone={() => setEditId(null)} />
              </li>
            ) : (
              <li
                key={p.id}
                className={`flex flex-wrap items-center gap-x-3 rounded-xl border px-3 py-2 ${p.done ? 'border-edge/50 bg-void/40' : 'border-edge bg-raise/70'}`}
              >
                <PlanTick item={p} locked={!canTick} />
                {p.time && <span className="shrink-0 text-sm font-semibold text-glow tabular-nums">{p.time}</span>}
                <p className={`min-w-32 flex-1 text-sm font-medium break-words ${p.done ? 'text-mute line-through' : ''}`}>{p.title}</p>
                <span className="ml-auto flex items-center gap-1">
                  {(p.done ? p.xp > 0 : next.xp > 0) && (
                    <span className={`mr-1 shrink-0 text-xs ${p.done ? 'font-semibold text-gold' : 'text-mute'}`}>
                      +{p.done ? p.xp : next.xp} XP
                    </span>
                  )}
                  {!p.done && (
                    <IconButton label={`Change ${p.title}`} onClick={() => setEditId(p.id)}>
                      <Pencil size={16} />
                    </IconButton>
                  )}
                  <IconButton label={`Remove ${p.title}`} onClick={() => deletePlanItem(p.id)}>
                    <Trash2 size={16} />
                  </IconButton>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addPlanItem(date, { title, time });
          setTitle('');
          setTime(null);
        }}
      >
        <input
          className={`${inputBase} min-w-48 flex-[3]`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Type your own, e.g. Dentist"
          aria-label="New goal or appointment"
          maxLength={100}
        />
        <TimeInput value={time} onChange={setTime} label="Time, optional" className="w-36" />
        <Button variant="primary" type="submit" disabled={!title.trim()}>
          <Plus size={16} /> Add
        </Button>
      </form>
      <p className="mt-2 text-xs text-mute">
        A time is optional; things with a time are listed in order. The first {REWARDED_GOALS} you finish in a day earn +
        {each.xp} Focus XP and +{each.gold} gold each.
      </p>
    </Panel>
  );
}

function EditGoal({ item, onDone }: { item: PlanItem; onDone(): void }) {
  const updatePlanItem = useGame((s) => s.updatePlanItem);
  const [title, setTitle] = useState(item.title);
  const [time, setTime] = useState(item.time);
  return (
    <form
      className="flex flex-wrap gap-2 rounded-xl border border-glow/60 bg-raise/70 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        updatePlanItem(item.id, { title, time });
        onDone();
      }}
    >
      <input
        className={`${inputBase} min-w-48 flex-[3]`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Goal or appointment"
        maxLength={100}
        autoFocus
      />
      <TimeInput value={time} onChange={setTime} label="Time, optional" className="w-36" />
      <Button variant="primary" type="submit" disabled={!title.trim()}>
        Save
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

/** Things planned for a day that has come and that were never ticked off. */
function Leftover({ items, date, name }: { items: PlanItem[]; date: DateStr; name: string }) {
  const movePlanItem = useGame((s) => s.movePlanItem);
  const deletePlanItem = useGame((s) => s.deletePlanItem);
  const today = useToday();
  const from = (d: DateStr) => (d === today ? 'today' : d === addDays(today, -1) ? 'yesterday' : formatShort(d));
  const target = name === 'Today' || name === 'Tomorrow' ? name.toLowerCase() : name;

  return (
    <Panel title="Not finished yet" right={<span className="text-xs text-mute">{items.length}</span>}>
      <p className="mb-3 text-sm text-mute">Planned for an earlier day and not ticked off. Move one to {target}, or drop it.</p>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-edge bg-raise/70 px-3 py-2">
            <div className="min-w-40 flex-1">
              <p className="text-sm font-medium break-words">{p.title}</p>
              <p className="text-[11px] text-mute">
                {p.main ? 'Main goal' : 'Goal'} from {from(p.date)}
              </p>
            </div>
            <Button onClick={() => movePlanItem(p.id, date)}>
              <ArrowRight size={16} /> Move to {target}
            </Button>
            <IconButton label={`Drop ${p.title}`} onClick={() => deletePlanItem(p.id)}>
              <Trash2 size={16} />
            </IconButton>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DayFrame({ date, day }: { date: DateStr; day: DayPlan | null }) {
  const data = useGame((s) => s.data);
  const saveDay = useGame((s) => s.saveDay);
  const today = useToday();
  const wake = day?.wake ?? null;
  const bed = day?.bed ?? null;
  const bedBefore = data.days[addDays(date, -1)]?.bed ?? null;
  const average = useMemo(() => averageSleep(sleepLogs(data), today), [data, today]);

  return (
    <Panel title="Waking and bedtime">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Wake up at">
          <TimeInput value={wake} onChange={(v) => saveDay(date, { wake: v })} label="Wake-up time" />
        </Field>
        <Field label="In bed by">
          <TimeInput value={bed} onChange={(v) => saveDay(date, { bed: v })} label="Bedtime" />
        </Field>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-mute">
        {wake ? (
          <li>
            To sleep 8 hours, be asleep by <strong className="text-ink tabular-nums">{shiftTime(wake, -8)}</strong> the night
            before.
          </li>
        ) : (
          <li>Optional. Set when to get up and this works out when to be asleep.</li>
        )}
        {wake && bedBefore && (
          <li>
            Bed is planned for {bedBefore} the night before: {formatSleep(hoursAsleep(bedBefore, wake))} until you get up.
          </li>
        )}
        {average !== null && <li>You have slept {formatSleep(average)} a night on average over the last 7 nights.</li>}
      </ul>
    </Panel>
  );
}

/** Monthly items, subscriptions and bills that fall on the day. */
function MoneyOnDay({ date }: { date: DateStr }) {
  const data = useGame((s) => s.data);
  const money = useMemo(() => moneyDue(data, date), [data, date]);
  if (money.length === 0 || !data.money) return null;
  return (
    <Panel title="Money on this day">
      <ul className="space-y-1 text-sm">
        {money.map((m) => (
          <li key={m.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {m.name}
              {m.onCard && <span className="text-mute"> · on the card</span>}
            </span>
            <span className={`shrink-0 tabular-nums ${m.kind === 'income' ? 'text-[var(--stat-vit)]' : ''}`}>
              {m.kind === 'income' ? '+' : '−'}
              {formatMoney(m.amount, data.money!.currency)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Note({ date, note }: { date: DateStr; note: string }) {
  const saveDay = useGame((s) => s.saveDay);
  const [text, setText] = useState(note);
  const unsaved = text.trim() !== note;
  return (
    <Panel title="Note to yourself">
      <textarea
        className={`${inputClass} min-h-28 py-2 leading-relaxed`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => unsaved && saveDay(date, { note: text })}
        placeholder="Anything to remember: what to prepare the night before, what to bring, who to call."
        aria-label="Note for the day"
        maxLength={600}
      />
      <p className="mt-1.5 text-xs text-mute">{unsaved ? 'Saved when you click away.' : note ? 'Saved.' : 'Optional.'}</p>
    </Panel>
  );
}
