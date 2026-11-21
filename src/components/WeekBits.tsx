import { Check, ChevronRight, Pencil, Play, Plus, SkipForward, Swords, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { statColor } from '../data/meta';
import { useGame } from '../data/store';
import type { DateStr, Routine, WeekGoal } from '../data/types';
import { BOSS_REWARD, bossFor, type BossKind } from '../game/boss';
import { weekStart } from '../game/dates';
import { routineSteps, routines } from '../game/routines';
import { useToday } from '../hooks';
import { WEEK_GOALS, weekGoalReward, weekGoals } from '../plan/week';
import { Bar, Button, IconButton, Modal, Panel, StatIcon, inputBase } from './ui';

/* Things that belong to the whole week: its boss, its goals, and the routines run through each day. */

// ---------- the boss ----------

const EYE = '#fff';
const DARK = '#1b1530';

function Eyes({ at, defeated, color = EYE, pupil = DARK }: { at: [number, number][]; defeated: boolean; color?: string; pupil?: string }) {
  return (
    <>
      {at.map(([x, y]) =>
        defeated ? (
          <path key={x} d={`M${x - 4} ${y - 4} l8 8 M${x + 4} ${y - 4} l-8 8`} stroke={DARK} strokeWidth="2.6" strokeLinecap="round" />
        ) : (
          <g key={x}>
            <ellipse cx={x} cy={y} rx="5" ry="6" fill={color} />
            <circle cx={x + 1} cy={y + 1} r="2.6" fill={pupil} />
          </g>
        ),
      )}
    </>
  );
}

/** The week's monster, drawn in code. Beaten, it is grey with crossed eyes. */
export function BossArt({ kind, defeated, className = '' }: { kind: BossKind; defeated: boolean; className?: string }) {
  const art = (() => {
    switch (kind) {
      case 'bat':
        return (
          <>
            <path d="M34 52 C20 26 6 32 3 50 C9 45 13 51 15 58 C20 51 26 55 28 62 Z" fill="#4a3d7a" />
            <path d="M66 52 C80 26 94 32 97 50 C91 45 87 51 85 58 C80 51 74 55 72 62 Z" fill="#4a3d7a" />
            <path d="M36 34 L33 16 L46 28 Z M64 34 L67 16 L54 28 Z" fill="#5d4d96" />
            <ellipse cx="50" cy="52" rx="20" ry="22" fill="#5d4d96" />
            <Eyes at={[[42, 48], [58, 48]]} defeated={defeated} color="#ffd0d6" pupil="#c9303f" />
            <path d="M43 62 L46 68 L49 62 M51 62 L54 68 L57 62" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          </>
        );
      case 'golem':
        return (
          <>
            <rect x="12" y="42" width="16" height="34" rx="5" fill="#737a8c" />
            <rect x="72" y="42" width="16" height="34" rx="5" fill="#737a8c" />
            <rect x="26" y="36" width="48" height="46" rx="8" fill="#8a91a3" />
            <rect x="35" y="14" width="30" height="26" rx="6" fill="#9aa1b3" />
            <path d="M32 56 H68 M50 44 V78" stroke="#737a8c" strokeWidth="2.5" strokeLinecap="round" />
            {defeated ? (
              <Eyes at={[[43, 26], [57, 26]]} defeated />
            ) : (
              <path d="M40 26 h7 M53 26 h7" stroke="#6fd6ff" strokeWidth="4" strokeLinecap="round" />
            )}
            <rect x="32" y="80" width="14" height="10" rx="3" fill="#737a8c" />
            <rect x="54" y="80" width="14" height="10" rx="3" fill="#737a8c" />
          </>
        );
      case 'wraith':
        return (
          <>
            <path d="M24 88 C20 42 34 12 50 12 C66 12 80 42 76 88 L67 78 L59 88 L50 78 L41 88 L33 78 Z" fill="#a9bbdd" opacity="0.92" />
            <path d="M24 60 C14 58 10 66 8 74 C16 70 20 72 24 76 Z M76 60 C86 58 90 66 92 74 C84 70 80 72 76 76 Z" fill="#a9bbdd" opacity="0.8" />
            {defeated ? (
              <Eyes at={[[41, 42], [59, 42]]} defeated />
            ) : (
              <>
                <ellipse cx="41" cy="42" rx="5" ry="7.5" fill={DARK} />
                <ellipse cx="59" cy="42" rx="5" ry="7.5" fill={DARK} />
              </>
            )}
            <ellipse cx="50" cy="60" rx="5" ry="7" fill={DARK} />
          </>
        );
      case 'drake':
        return (
          <>
            <path d="M20 46 L8 26 L28 36 Z M80 46 L92 26 L72 36 Z" fill="#2f6b45" />
            <path d="M38 22 L34 6 L46 18 Z M62 22 L66 6 L54 18 Z" fill="#e8dcc0" />
            <ellipse cx="50" cy="48" rx="30" ry="29" fill="#4d9a62" />
            <ellipse cx="50" cy="64" rx="19" ry="14" fill="#6bb87f" />
            <Eyes at={[[38, 40], [62, 40]]} defeated={defeated} color="#ffe08a" />
            <circle cx="44" cy="62" r="2" fill="#2f6b45" />
            <circle cx="56" cy="62" r="2" fill="#2f6b45" />
            <path d="M38 72 Q50 78 62 72" fill="none" stroke="#2f6b45" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M42 73 l2.5 4 l2.5 -3.4 M53 73.6 l2.5 3.4 l2.5 -4" fill="#fff" />
          </>
        );
      case 'mimic':
        return (
          <>
            <path d="M16 50 Q16 22 50 22 Q84 22 84 50 Z" fill="#9a6a44" />
            <path d="M16 50 Q16 22 50 22 Q84 22 84 50" fill="none" stroke="#f3c452" strokeWidth="3" />
            <rect x="16" y="56" width="68" height="30" rx="4" fill="#7d5334" />
            <path d="M16 56 H84 M16 86 H84" stroke="#f3c452" strokeWidth="3" />
            <path d="M18 50 l5 8 l5 -8 l5 8 l5 -8 l5 8 l5 -8 l5 8 l5 -8 l5 8 l5 -8 l5 8 l5 -8 l4 6" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
            <path d="M42 58 Q50 76 58 58 Z" fill="#e23f55" />
            <Eyes at={[[38, 38], [62, 38]]} defeated={defeated} color="#ffe08a" />
          </>
        );
      default:
        return (
          <>
            <path d="M14 80 C8 50 28 20 50 20 C72 20 92 50 86 80 C84 90 16 90 14 80 Z" fill="#7a5fd0" />
            <path d="M28 44 C32 32 42 27 50 27" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" />
            <Eyes at={[[39, 56], [61, 56]]} defeated={defeated} />
            <path d={defeated ? 'M42 72 Q50 67 58 72' : 'M42 70 Q50 76 58 70'} fill="none" stroke={DARK} strokeWidth="2.6" strokeLinecap="round" />
          </>
        );
    }
  })();
  return (
    <svg viewBox="0 0 100 100" className={`${defeated ? 'opacity-50 grayscale' : 'boss-idle'} ${className}`} aria-hidden>
      <ellipse cx="50" cy="92" rx="30" ry="4" fill="#000" opacity="0.35" />
      {art}
    </svg>
  );
}

/** The boss of the week a day is in: how much health it has left, and what beating it is worth. */
export function BossCard({ date, compact = false }: { date: DateStr; compact?: boolean }) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const boss = useMemo(() => bossFor(data, date, today), [data, date, today]);
  if (!boss) return null;
  const upcoming = boss.week > today;
  const over = boss.daysLeft === 0;

  return (
    <Panel
      title="Weekly boss"
      right={
        <span className="text-xs text-mute">
          {boss.defeated ? 'Defeated' : upcoming ? 'Arrives Monday' : over ? 'It got away' : boss.daysLeft === 1 ? 'Last day' : `${boss.daysLeft} days left`}
        </span>
      }
    >
      <div className="flex items-center gap-4">
        {/* Re-keyed when it is hit, so it flinches each time. */}
        <div key={boss.damage} className={`shrink-0 ${compact ? 'size-16' : 'size-24'} ${boss.damage > 0 && !boss.defeated ? 'animate-goal' : ''}`}>
          <BossArt kind={boss.kind} defeated={boss.defeated} className="size-full" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-display text-lg leading-tight font-bold ${boss.defeated ? 'text-gold' : ''}`}>{boss.name}</p>
          {!compact && <p className="mt-0.5 text-xs text-mute">{boss.taunt}</p>}
          <div className="mt-2 flex items-baseline justify-between gap-2 text-[11px] text-mute tabular-nums">
            <span>
              HP {boss.hp}/{boss.maxHp}
            </span>
            <span>{Math.round((boss.damage / boss.maxHp) * 100)}% done</span>
          </div>
          <Bar value={boss.hp} max={boss.maxHp} color={boss.defeated ? 'var(--color-gold)' : 'var(--color-danger)'} className="mt-1 h-2.5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-mute">
        {boss.defeated ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-gold">
            <Trophy size={14} /> Chest opened: +{BOSS_REWARD.xp} XP and +{BOSS_REWARD.gold} gold.
          </span>
        ) : over ? (
          'It survived the week. Nothing is lost; another one comes on Monday.'
        ) : (
          <>
            Every habit you do this week hurts it, harder habits more. Beat it by Sunday for +{BOSS_REWARD.xp} XP and +
            {BOSS_REWARD.gold} gold.
          </>
        )}
      </p>
    </Panel>
  );
}

// ---------- goals for the week ----------

/** The week's goals: tick them, add up to three, reword or drop them. */
export function WeekGoalsPanel({
  week,
  onPlanWeek,
}: {
  /** Any day of the week. */
  week: DateStr;
  /** When given, a link to the week planner is shown. */
  onPlanWeek?: () => void;
}) {
  const data = useGame((s) => s.data);
  const today = useToday();
  const addWeekGoal = useGame((s) => s.addWeekGoal);
  const monday = weekStart(week);
  const goals = useMemo(() => weekGoals(data, monday), [data, monday]);
  const [title, setTitle] = useState('');
  const reward = weekGoalReward(data);
  const started = monday <= today;
  const done = goals.filter((g) => g.done).length;
  const used = Object.values(data.weekGoals).filter((g) => g.week === monday && (!g.deleted || g.done)).length;

  return (
    <Panel
      title={monday === weekStart(today) ? 'This week’s goals' : 'Goals for the week'}
      right={goals.length > 0 ? <span className="text-xs text-mute tabular-nums">{started ? `${done}/${goals.length}` : goals.length}</span> : undefined}
    >
      {goals.length > 0 && (
        <ul className="mb-3 space-y-2">
          {goals.map((g) => (
            <WeekGoalRow key={g.id} goal={g} locked={!started} />
          ))}
        </ul>
      )}
      {used < WEEK_GOALS ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            addWeekGoal(monday, title);
            setTitle('');
          }}
        >
          <input
            className={`${inputBase} min-w-0 flex-1`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={goals.length === 0 ? 'e.g. Run three times' : 'Another goal for the week'}
            aria-label="New goal for the week"
            maxLength={100}
          />
          <Button variant="primary" type="submit" disabled={!title.trim()}>
            <Plus size={16} /> Add
          </Button>
        </form>
      ) : (
        <p className="text-xs text-mute">Three goals is the most a week can hold.</p>
      )}
      <p className="mt-2 text-xs text-mute">
        Up to {WEEK_GOALS} things for the week as a whole. Each one achieved earns +{reward.xp} Focus XP and +{reward.gold} gold.
        {onPlanWeek && (
          <>
            {' '}
            <button type="button" className="text-glow underline-offset-2 hover:underline" onClick={onPlanWeek}>
              Plan the week
            </button>
          </>
        )}
      </p>
    </Panel>
  );
}

function WeekGoalRow({ goal, locked }: { goal: WeekGoal; locked: boolean }) {
  const toggleWeekGoal = useGame((s) => s.toggleWeekGoal);
  const renameWeekGoal = useGame((s) => s.renameWeekGoal);
  const deleteWeekGoal = useGame((s) => s.deleteWeekGoal);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(goal.title);

  if (editing) {
    return (
      <li>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) renameWeekGoal(goal.id, text);
            setEditing(false);
          }}
        >
          <input className={`${inputBase} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Goal for the week" maxLength={100} autoFocus />
          <Button variant="primary" type="submit" disabled={!text.trim()}>
            Save
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li
      key={String(goal.done)}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${goal.done ? 'animate-goal border-gold/60 bg-gold/10' : 'border-edge bg-raise/70'}`}
    >
      <button
        type="button"
        aria-pressed={goal.done}
        aria-label={locked ? `${goal.title}: can be ticked once the week begins` : `${goal.done ? 'Undo' : 'Achieve'} ${goal.title}`}
        title={locked ? 'Can be ticked once the week begins' : undefined}
        disabled={locked}
        onClick={() => toggleWeekGoal(goal.id)}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-gold transition-transform enabled:hover:scale-105 disabled:opacity-40"
        style={{ background: goal.done ? 'var(--color-gold)' : 'transparent', color: 'var(--color-void)' }}
      >
        {goal.done && <Check size={18} strokeWidth={3} className="animate-pop" />}
      </button>
      <p className={`min-w-0 flex-1 text-sm font-medium break-words ${goal.done ? 'text-gold' : ''}`}>{goal.title}</p>
      {goal.done ? (
        <span className="shrink-0 text-xs font-semibold text-gold">+{goal.xp} XP</span>
      ) : (
        <span className="flex shrink-0">
          <IconButton label={`Reword ${goal.title}`} onClick={() => setEditing(true)}>
            <Pencil size={15} />
          </IconButton>
          <IconButton label={`Drop ${goal.title}`} onClick={() => deleteWeekGoal(goal.id)}>
            <Trash2 size={15} />
          </IconButton>
        </span>
      )}
    </li>
  );
}

// ---------- routines ----------

/** The routines, each with how far it is today and a button to run through it. */
export function RoutinesCard({ date, onManage }: { date: DateStr; onManage(): void }) {
  const data = useGame((s) => s.data);
  const list = useMemo(() => routines(data), [data]);
  const [running, setRunning] = useState<Routine | null>(null);
  if (list.length === 0) return null;

  return (
    <Panel
      title="Routines"
      right={
        <button type="button" className="text-xs text-mute hover:text-ink" onClick={onManage}>
          Edit
        </button>
      }
    >
      <ul className="space-y-2">
        {list.map((r) => {
          const steps = routineSteps(data, r, date);
          const done = steps.filter((s) => s.done).length;
          const finished = steps.length > 0 && done === steps.length;
          return (
            <li key={r.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${finished ? 'border-gold/50 bg-gold/10' : 'border-edge bg-raise/70'}`}>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${finished ? 'text-gold' : ''}`}>{r.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Bar value={done} max={Math.max(1, steps.length)} color={finished ? 'var(--color-gold)' : 'var(--color-glow)'} className="h-1.5 flex-1" />
                  <span className="text-[11px] text-mute tabular-nums">
                    {steps.length === 0 ? 'nothing today' : `${done}/${steps.length}`}
                  </span>
                </div>
              </div>
              {finished ? (
                <Check size={18} className="shrink-0 text-gold" aria-label="Done" />
              ) : (
                <Button variant="primary" className="min-h-9 shrink-0" onClick={() => setRunning(r)} disabled={steps.length === 0}>
                  <Play size={14} /> {done > 0 ? 'Continue' : 'Start'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {running && <RoutineRunner routine={running} date={date} onClose={() => setRunning(null)} />}
    </Panel>
  );
}

/** Running through a routine: one habit at a time, done or skipped, until the end. */
function RoutineRunner({ routine, date, onClose }: { routine: Routine; date: DateStr; onClose(): void }) {
  const data = useGame((s) => s.data);
  const setHabitCount = useGame((s) => s.setHabitCount);
  const steps = routineSteps(data, routine, date);
  // Habits passed over this time round; they stay undone.
  const [passed, setPassed] = useState<string[]>([]);
  const current = steps.find((s) => !s.done && !passed.includes(s.habit.id));
  const done = steps.filter((s) => s.done).length;

  return (
    <Modal title={routine.name} onClose={onClose}>
      <ol className="mb-4 flex gap-1.5" aria-label="Steps">
        {steps.map((s) => (
          <li
            key={s.habit.id}
            title={s.habit.name}
            className={`h-1.5 flex-1 rounded-full ${s.done ? 'bg-gold' : s.habit.id === current?.habit.id ? 'bg-glow' : 'bg-edge'}`}
          />
        ))}
      </ol>

      {current ? (
        <div key={current.habit.id} className="animate-fade text-center">
          <p className="text-xs text-mute">
            Step {steps.indexOf(current) + 1} of {steps.length}
          </p>
          <p className="mx-auto mt-3 flex size-16 items-center justify-center rounded-full border-2" style={{ borderColor: statColor(current.habit.stat) }}>
            <StatIcon stat={current.habit.stat} size={28} />
          </p>
          <h3 className="mt-3 font-display text-2xl leading-snug font-bold break-words">{current.habit.name}</h3>
          {current.habit.why && <p className="mt-1 text-sm text-mute">“{current.habit.why}”</p>}
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="ghost" onClick={() => setPassed((p) => [...p, current.habit.id])}>
              <SkipForward size={16} /> Not now
            </Button>
            <Button variant="gold" className="min-h-12 min-w-40 text-base" onClick={() => setHabitCount(current.habit.id, date, current.habit.target)} autoFocus>
              <Check size={18} /> Done
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="animate-fade text-center">
          <p className="mx-auto flex size-16 items-center justify-center rounded-full border-2 border-gold bg-gold/10 text-gold">
            <Swords size={28} />
          </p>
          <h3 className="mt-3 font-display text-2xl font-bold">{done === steps.length ? 'Routine complete' : 'That’s the round'}</h3>
          <p className="mt-1 text-sm text-mute">
            {done} of {steps.length} done
            {done < steps.length ? '. The ones you passed over are still on Today.' : '.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {done < steps.length && (
              <Button variant="ghost" onClick={() => setPassed([])}>
                Go round again
              </Button>
            )}
            <Button variant="primary" onClick={onClose} autoFocus>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
