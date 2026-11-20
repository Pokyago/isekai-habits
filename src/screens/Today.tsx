import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { HabitCard } from '../components/HabitCard';
import { Bar, Button, Chip, Empty, IconButton, Panel, StatIcon, inputClass } from '../components/ui';
import { DIFFICULTIES, DIFFICULTY_ORDER, STATS, STAT_ORDER, statColor } from '../data/meta';
import { categoryIndex, habitCategory } from '../data/habitCategories';
import { useGame } from '../data/store';
import { categoryOf } from '../data/templates';
import type { Difficulty, Habit, StatKey } from '../data/types';
import { useDerived, useToday } from '../hooks';
import { dailyQuests } from '../game/dailyQuests';
import { addDays, daysBetween, formatLong } from '../game/dates';
import { dueHabits } from '../game/schedule';
import { BASE_XP } from '../game/xp';

const DAYS_BACK = 7;

const byCategoryThenName = (a: Habit, b: Habit) =>
  categoryIndex(categoryOf(a)) - categoryIndex(categoryOf(b)) || a.name.localeCompare(b.name);

/** Habit cards under a small heading per category. With a single category the heading is left out. */
function HabitGroups({ habits, render }: { habits: Habit[]; render(habit: Habit): ReactNode }) {
  const groups: { id: string; habits: Habit[] }[] = [];
  for (const h of habits) {
    const id = categoryOf(h);
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.habits.push(h);
    else groups.push({ id, habits: [h] });
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.id} className="space-y-2">
          {groups.length > 1 && (
            <h3 className="px-1 text-[11px] font-semibold tracking-wide text-mute uppercase">{habitCategory(g.id).name}</h3>
          )}
          {g.habits.map(render)}
        </section>
      ))}
    </div>
  );
}

export function Today({ onManageHabits }: { onManageHabits(): void }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const derived = useDerived();
  const [offset, setOffset] = useState(0);
  const date = addDays(today, -offset);

  const due = useMemo(() => dueHabits(data, date).sort(byCategoryThenName), [data, date]);
  const scheduled = due.filter((h) => h.schedule.kind === 'weekdays');
  const weekly = due.filter((h) => h.schedule.kind === 'perWeek');
  const quests = useMemo(() => dailyQuests(data, date), [data, date]);

  const doneCount = scheduled.filter((h) => data.completions[`${h.id}|${date}`]?.done).length;
  const ago = daysBetween(date, today);
  const dayLabel = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : `${ago} days ago`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Previous day" onClick={() => setOffset(offset + 1)} disabled={offset >= DAYS_BACK}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">{dayLabel}</h1>
          <p className="text-sm text-mute">{formatLong(date)}</p>
        </div>
        <IconButton label="Next day" onClick={() => setOffset(offset - 1)} disabled={offset === 0}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      {quests.length > 0 && (
        <Panel title="Daily quests">
          <ul className="space-y-3">
            {quests.map((q) => (
              <li key={q.slot} className="flex items-center gap-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                    q.done ? 'border-gold bg-gold text-void' : 'border-edge text-mute'
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
      )}

      <Panel
        title="Habits"
        right={
          scheduled.length > 0 ? (
            <span className="text-xs text-mute">
              {doneCount}/{scheduled.length} done
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
        ) : (
          <HabitGroups
            habits={scheduled}
            render={(h) => <HabitCard key={h.id} habit={h} date={date} data={data} streak={derived.streaks[h.id]} />}
          />
        )}
      </Panel>

      {weekly.length > 0 && (
        <Panel title="This week">
          <HabitGroups
            habits={weekly}
            render={(h) => <HabitCard key={h.id} habit={h} date={date} data={data} streak={derived.streaks[h.id]} />}
          />
        </Panel>
      )}

      <QuestLog date={date} />
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
          className={`${inputClass} min-w-48 flex-[3]`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New quest, e.g. Book a dentist appointment"
          aria-label="New quest"
          maxLength={100}
        />
        <select
          className={`${inputClass} w-auto flex-1`}
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
          className={`${inputClass} w-auto flex-1`}
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
