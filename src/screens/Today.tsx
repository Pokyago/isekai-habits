import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HabitCard } from '../components/HabitCard';
import { SleepQuick } from '../components/SleepQuick';
import { Bar, Button, Chip, Empty, IconButton, Panel, Ring, StatIcon, inputBase } from '../components/ui';
import { DIFFICULTIES, DIFFICULTY_ORDER, STATS, STAT_ORDER, statColor } from '../data/meta';
import { categoryIndex, habitCategory } from '../data/habitCategories';
import { useGame } from '../data/store';
import { categoryOf } from '../data/templates';
import type { DateStr, Difficulty, Habit, StatKey } from '../data/types';
import { useCountUp, useDayProgress, useDerived, useToday } from '../hooks';
import { dailyQuests, type DailyQuest } from '../game/dailyQuests';
import { addDays, daysBetween, formatLong } from '../game/dates';
import { dueHabits, isDone } from '../game/schedule';
import { BASE_XP } from '../game/xp';

const DAYS_BACK = 7;
const HIDE_DONE_KEY = 'isekai-habits-hide-done';

const byCategoryThenName = (a: Habit, b: Habit) =>
  categoryIndex(categoryOf(a)) - categoryIndex(categoryOf(b)) || a.name.localeCompare(b.name);

/**
 * Habit cards under a heading per category, each with its own progress. The cards
 * flow into two or three columns when there is room.
 */
function HabitGroups({
  habits,
  date,
  hideDone,
}: {
  habits: Habit[];
  date: DateStr;
  hideDone: boolean;
}) {
  const data = useGame((s) => s.data);
  const derived = useDerived();
  const groups: { id: string; habits: Habit[] }[] = [];
  for (const h of habits) {
    const id = categoryOf(h);
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.habits.push(h);
    else groups.push({ id, habits: [h] });
  }

  let position = 0;
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const done = g.habits.filter((h) => isDone(data, h.id, date)).length;
        const shown = hideDone ? g.habits.filter((h) => !isDone(data, h.id, date)) : g.habits;
        const complete = done === g.habits.length;
        return (
          <section key={g.id}>
            <header className="mb-2 flex items-center gap-3 px-1">
              <h3 className={`text-[11px] font-semibold tracking-wide uppercase ${complete ? 'text-gold' : 'text-mute'}`}>
                {habitCategory(g.id).name}
              </h3>
              <Bar
                value={done}
                max={g.habits.length}
                color={complete ? 'var(--color-gold)' : statColor(habitCategory(g.id).stat)}
                className="h-1 max-w-32 flex-1"
              />
              <span className={`text-[11px] tabular-nums ${complete ? 'font-semibold text-gold' : 'text-mute'}`}>
                {done}/{g.habits.length}
              </span>
            </header>
            {shown.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2 3xl:grid-cols-3">
                {shown.map((h) => (
                  <HabitCard
                    // Keyed by date too, so moving to another day doesn't replay the completion burst.
                    key={`${h.id}|${date}`}
                    habit={h}
                    date={date}
                    data={data}
                    streak={derived.streaks[h.id]}
                    delay={Math.min(position++ * 35, 420)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The day at a glance: a ring for the habits done, and what has been earned. */
function DayCard({ date, isToday }: { date: DateStr; isToday: boolean }) {
  const day = useDayProgress(date);
  const xp = useCountUp(day.xp);
  const allDone = day.total > 0 && day.done === day.total;
  const percent = day.total === 0 ? 0 : Math.round((day.done / day.total) * 100);
  const left = day.total - day.done;

  return (
    <Panel>
      <div className="flex items-center gap-4">
        <Ring value={day.done} max={day.total} size={92} stroke={8} color={allDone ? 'var(--color-gold)' : 'var(--color-glow)'}>
          <span className={`font-display text-2xl font-bold tabular-nums ${allDone ? 'text-gold' : ''}`}>{percent}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className={`font-display text-lg font-bold ${allDone ? 'text-gold' : ''}`}>
            {day.total === 0
              ? 'Nothing scheduled'
              : allDone
                ? 'Flawless day'
                : `${day.done} of ${day.total} habits done`}
          </p>
          <p className="text-sm text-mute">
            {day.total === 0
              ? 'A free day. Rest counts too.'
              : allDone
                ? 'Every habit scheduled for the day is done.'
                : isToday
                  ? `${left} to go today.`
                  : `${left} left undone.`}
          </p>
          <p className="mt-1.5 text-sm">
            <span className="font-semibold text-gold tabular-nums">+{xp} XP</span>{' '}
            <span className="text-mute">earned {isToday ? 'today' : 'that day'}</span>
          </p>
        </div>
      </div>
    </Panel>
  );
}

function DailyQuests({ quests }: { quests: DailyQuest[] }) {
  if (quests.length === 0) return null;
  return (
    <Panel title="Daily quests" right={<span className="text-xs text-mute">{quests.filter((q) => q.done).length}/{quests.length}</span>}>
      <ul className="space-y-3">
        {quests.map((q) => (
          <li key={q.slot} className="flex items-center gap-3">
            <span
              // Re-keyed when it completes, so the pulse plays once at that moment.
              key={String(q.done)}
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                q.done ? 'animate-goal border-gold bg-gold text-void' : 'border-edge text-mute'
              }`}
            >
              {q.done ? <Check size={16} strokeWidth={3} /> : <span className="text-xs">{q.slot + 1}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className={`font-semibold ${q.done ? 'text-gold' : ''}`}>{q.title}</span>
                <span className="text-mute">{q.detail}</span>
              </p>
              <Bar value={q.progress} max={q.goal} color="var(--color-gold)" className="mt-1.5 h-1.5" />
            </div>
            <span className="shrink-0 text-right text-xs leading-tight text-mute">
              +{q.xp} XP
              <br />+{q.gold} gold
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Today({ onManageHabits }: { onManageHabits(): void }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const [offset, setOffset] = useState(0);
  const date = addDays(today, -offset);
  const [hideDone, setHideDone] = useState(() => {
    try {
      return localStorage.getItem(HIDE_DONE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleHideDone = () => {
    setHideDone((cur) => {
      try {
        localStorage.setItem(HIDE_DONE_KEY, cur ? '0' : '1');
      } catch {
        // The choice just won't be remembered next time.
      }
      return !cur;
    });
  };

  const due = useMemo(() => dueHabits(data, date).sort(byCategoryThenName), [data, date]);
  const scheduled = due.filter((h) => h.schedule.kind === 'weekdays');
  const weekly = due.filter((h) => h.schedule.kind === 'perWeek');
  const quests = useMemo(() => dailyQuests(data, date), [data, date]);

  const doneCount = scheduled.filter((h) => isDone(data, h.id, date)).length;
  const ago = daysBetween(date, today);
  const dayLabel = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : `${ago} days ago`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 lg:justify-start lg:gap-4">
        <IconButton label="Previous day" onClick={() => setOffset(offset + 1)} disabled={offset >= DAYS_BACK}>
          <ChevronLeft size={20} />
        </IconButton>
        <div key={date} className="animate-fade text-center lg:min-w-56">
          <h1 className="font-display text-2xl font-bold lg:text-3xl">{dayLabel}</h1>
          <p className="text-sm text-mute">{formatLong(date)}</p>
        </div>
        <IconButton label="Next day" onClick={() => setOffset(offset - 1)} disabled={offset === 0}>
          <ChevronRight size={20} />
        </IconButton>
        {offset > 0 && (
          <Button variant="ghost" className="hidden lg:inline-flex" onClick={() => setOffset(0)}>
            Back to today
          </Button>
        )}
      </div>

      {/* Wide windows: habits on the left, the day's goals in a column on the right that stays in view. */}
      <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-6 xl:space-y-0">
        <aside className="space-y-4 xl:sticky xl:top-20 xl:order-2 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1">
          <DayCard date={date} isToday={offset === 0} />
          <DailyQuests quests={quests} />
          {offset === 0 && <SleepQuick />}
          <div className="hidden xl:block">
            <QuestLog date={date} />
          </div>
        </aside>

        <div className="space-y-4 xl:order-1">
          <Panel
            title="Habits"
            right={
              scheduled.length > 0 ? (
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleHideDone}
                    aria-pressed={hideDone}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${hideDone ? 'bg-glow/15 text-glow' : 'text-mute hover:text-ink'}`}
                  >
                    {hideDone ? 'Showing what’s left' : 'Hide done'}
                  </button>
                  <span className="text-xs text-mute tabular-nums">
                    {doneCount}/{scheduled.length} done
                  </span>
                </span>
              ) : undefined
            }
          >
            {scheduled.length === 0 ? (
              <div className="text-center">
                <Empty>{due.length === 0 ? 'No habits yet. Add one to start earning XP.' : 'Nothing scheduled for this day.'}</Empty>
                {due.length === 0 && (
                  <Button variant="primary" onClick={onManageHabits}>
                    <Plus size={16} /> Add a habit
                  </Button>
                )}
              </div>
            ) : hideDone && doneCount === scheduled.length ? (
              <Empty>Everything scheduled is done.</Empty>
            ) : (
              <HabitGroups habits={scheduled} date={date} hideDone={hideDone} />
            )}
          </Panel>

          {weekly.length > 0 && (
            <Panel title="This week">
              <HabitGroups habits={weekly} date={date} hideDone={false} />
            </Panel>
          )}

          <div className="xl:hidden">
            <QuestLog date={date} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestLog({ date }: { date: string }) {
  const quests = useGame((s) => s.data.quests);
  const addQuest = useGame((s) => s.addQuest);
  const toggleQuest = useGame((s) => s.toggleQuest);
  const deleteQuest = useGame((s) => s.deleteQuest);
  const [title, setTitle] = useState('');
  const [stat, setStat] = useState<StatKey>('foc');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  const visible = Object.values(quests)
    .filter((q) => !q.deleted && (q.doneDate === null || q.doneDate === date))
    .sort((a, b) => Number(a.doneDate !== null) - Number(b.doneDate !== null) || a.createdAt - b.createdAt);

  return (
    <Panel title="Quest log">
      <p className="mb-3 text-sm text-mute">One-off tasks. Finish one to earn XP once.</p>
      {visible.length > 0 && (
        <ul className="mb-3 space-y-2">
          {visible.map((q) => {
            const done = q.doneDate !== null;
            return (
              <li
                key={q.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${done ? 'border-edge/50 bg-void/40' : 'border-edge bg-raise/70'}`}
              >
                <button
                  type="button"
                  aria-pressed={done}
                  aria-label={`${done ? 'Undo' : 'Complete'} ${q.title}`}
                  onClick={() => toggleQuest(q.id, date)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2"
                  style={{
                    borderColor: statColor(q.stat),
                    background: done ? statColor(q.stat) : 'transparent',
                    color: 'var(--color-void)',
                  }}
                >
                  {done && <Check size={18} strokeWidth={3} className="animate-pop" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${done ? 'text-mute line-through' : ''}`}>{q.title}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Chip color={statColor(q.stat)}>
                      <StatIcon stat={q.stat} size={11} />
                      {STATS[q.stat].short}
                    </Chip>
                    <Chip>{DIFFICULTIES[q.difficulty].name}</Chip>
                  </div>
                </div>
                <span className={`shrink-0 text-xs ${done ? 'font-semibold text-gold' : 'text-mute'}`}>
                  +{done ? q.xp : BASE_XP[q.difficulty]} XP
                </span>
                <IconButton label={`Delete ${q.title}`} onClick={() => deleteQuest(q.id)}>
                  <Trash2 size={16} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addQuest(title, stat, difficulty);
          setTitle('');
        }}
      >
        <input
          className={`${inputBase} min-w-48 flex-[3]`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New quest, e.g. Book a dentist appointment"
          aria-label="New quest"
          maxLength={100}
        />
        <select
          className={`${inputBase} w-auto flex-1`}
          value={stat}
          onChange={(e) => setStat(e.target.value as StatKey)}
          aria-label="Quest stat"
        >
          {STAT_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATS[s].name}
            </option>
          ))}
        </select>
        <select
          className={`${inputBase} w-auto flex-1`}
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          aria-label="Quest difficulty"
        >
          {DIFFICULTY_ORDER.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTIES[d].name}
            </option>
          ))}
        </select>
        <Button variant="primary" type="submit" disabled={!title.trim()}>
          <Plus size={16} /> Add
        </Button>
      </form>
    </Panel>
  );
}
