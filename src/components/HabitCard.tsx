import { Check, Flame, Minus } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CLASSES, DIFFICULTIES, STATS, statColor } from '../data/meta';
import { useGame } from '../data/store';
import type { DateStr, Habit, SaveData } from '../data/types';
import { completionId, scheduleLabel, weekCount } from '../game/schedule';
import { bonusStreak, type HabitStreak } from '../game/streaks';
import { habitReward } from '../game/xp';
import { Chip, StatIcon } from './ui';

export function HabitCard({
  habit,
  date,
  data,
  streak,
  slipped = false,
  delay = 0,
}: {
  habit: Habit;
  date: DateStr;
  data: SaveData;
  streak: HabitStreak | undefined;
  /** It was missed yesterday and is still open: the one not to miss twice. */
  slipped?: boolean;
  /** Milliseconds to wait before the card appears, so a list arrives one after another. */
  delay?: number;
}) {
  const setHabitCount = useGame((s) => s.setHabitCount);
  const completion = data.completions[completionId(habit.id, date)];
  const count = completion?.count ?? 0;
  const done = completion?.done ?? false;
  const counted = habit.target > 1;
  const color = statColor(habit.stat);

  const classMatch = data.hero ? CLASSES[data.hero.heroClass].stat === habit.stat : false;
  const nextStreak = bonusStreak(habit, streak) + (habit.schedule.kind === 'weekdays' ? 1 : 0);
  const xp = done ? completion.xp : habitReward(habit.difficulty, nextStreak, classMatch).xp;

  const weekly = habit.schedule.kind === 'perWeek' ? habit.schedule.times : null;
  const doneThisWeek = weekly ? weekCount(data, habit.id, date) : 0;

  // Each time the habit goes from not done to done, play the burst once.
  const wasDone = useRef(done);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (done && !wasDone.current) setBurst((n) => n + 1);
    wasDone.current = done;
  }, [done]);

  const toggle = () => {
    if (counted) {
      if (!done) setHabitCount(habit.id, date, count + 1);
    } else {
      setHabitCount(habit.id, date, done ? 0 : 1);
    }
  };

  return (
    // A simple habit can be ticked by clicking anywhere on its card; the round button does the same for the keyboard.
    <div
      onClick={counted ? undefined : toggle}
      style={{ animationDelay: `${delay}ms` }}
      className={`animate-rise group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,transform,box-shadow] duration-200 ${
        counted ? '' : 'cursor-pointer'
      } ${
        done
          ? 'border-edge/50 bg-void/40'
          : 'border-edge bg-raise/70 hover:-translate-y-0.5 hover:border-mute hover:shadow-[0_6px_18px_rgba(0,0,0,0.35)]'
      }`}
    >
      {burst > 0 && (
        <>
          <span
            key={`flash-${burst}`}
            className="animate-complete pointer-events-none absolute inset-0 rounded-xl"
            style={{ '--flash': color } as CSSProperties}
          />
          <span
            key={`xp-${burst}`}
            className="animate-float-xp pointer-events-none absolute top-0 right-3 z-10 text-sm font-bold text-gold drop-shadow-[0_0_6px_rgba(243,196,82,0.7)]"
          >
            +{xp} XP
          </span>
        </>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        aria-pressed={done}
        aria-label={
          counted
            ? `${habit.name}: ${count} of ${habit.target}. Add one`
            : `${done ? 'Undo' : 'Complete'} ${habit.name}`
        }
        className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-[background-color,transform,box-shadow] duration-200 group-hover:scale-105 active:scale-90"
        style={{
          borderColor: color,
          background: done ? color : 'transparent',
          color: done ? 'var(--color-void)' : color,
          boxShadow: done ? `0 0 14px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
        }}
      >
        {done ? (
          <Check key="done" size={24} strokeWidth={3} className="animate-pop" />
        ) : counted ? (
          <span key={count} className={count > 0 ? 'animate-pop' : ''}>
            {count}/{habit.target}
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 text-[15px] leading-snug font-medium transition-colors ${
            done ? 'text-mute line-through decoration-mute/50' : ''
          }`}
        >
          {habit.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip color={color}>
            <StatIcon stat={habit.stat} size={11} />
            {STATS[habit.stat].short}
          </Chip>
          <Chip>{DIFFICULTIES[habit.difficulty].name}</Chip>
          <Chip>{weekly ? `${Math.min(doneThisWeek, weekly)}/${weekly} this week` : scheduleLabel(habit.schedule)}</Chip>
        </div>
        {slipped && !done && (
          <p className="mt-1 text-[11px] leading-snug text-gold">
            Missed yesterday. Not twice.
            {habit.why && <span className="text-mute"> “{habit.why}”</span>}
          </p>
        )}
      </div>

      {counted && count > 0 && (
        <button
          type="button"
          onClick={() => setHabitCount(habit.id, date, count - 1)}
          aria-label={`Remove one from ${habit.name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-mute hover:bg-void/60 hover:text-ink"
        >
          <Minus size={16} />
        </button>
      )}

      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
        <span className={done ? 'font-semibold text-gold' : 'text-mute'}>+{xp} XP</span>
        {streak && streak.current > 0 && (
          <span className="inline-flex items-center gap-0.5 font-semibold text-[#ff9d5c]" title="Current streak">
            <Flame size={13} />
            {streak.current}
            {streak.unit === 'weeks' ? 'w' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
