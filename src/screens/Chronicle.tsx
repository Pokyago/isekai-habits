import { Flame } from 'lucide-react';
import { useMemo } from 'react';
import { Empty, Panel, StatIcon } from '../components/ui';
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS } from '../data/meta';
import { useGame } from '../data/store';
import type { DateStr, SaveData } from '../data/types';
import { useDerived, useToday } from '../hooks';
import { addDays, formatLong, weekStart } from '../game/dates';
import { isDone, isDueOn } from '../game/schedule';

const WEEKS = 16;

function dayActivity(data: SaveData, date: DateStr): { due: number; done: number } {
  let due = 0;
  let done = 0;
  for (const h of Object.values(data.habits)) {
    if (h.deleted) continue;
    const completed = isDone(data, h.id, date);
    if (h.schedule.kind === 'weekdays') {
      if (!isDueOn(h, date)) continue;
      due++;
      if (completed) done++;
    } else if (completed) {
      // Times-per-week habits only count on the days they were actually done.
      due++;
      done++;
    }
  }
  return { due, done };
}

export function Chronicle() {
  const data = useGame((s) => s.data);
  const today = useToday();
  const d = useDerived();

  const weeks = useMemo(() => {
    const first = addDays(weekStart(today), -(WEEKS - 1) * 7);
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(first, w * 7 + i);
        return { date, future: date > today, ...dayActivity(data, date) };
      }),
    );
  }, [data, today]);

  const shielded = new Set(d.shieldedDays);

  const rows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const c of Object.values(data.completions)) {
      if (c.done) totals.set(c.habitId, (totals.get(c.habitId) ?? 0) + 1);
    }
    return Object.values(data.habits)
      .filter((h) => !h.deleted && h.archivedOn === null)
      .map((h) => ({ habit: h, total: totals.get(h.id) ?? 0 }))
      .sort((a, b) => b.total - a.total || a.habit.name.localeCompare(b.habit.name));
  }, [data]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <h1 className="font-display text-2xl font-bold lg:col-span-2">Chronicle</h1>

      <Panel title={`Last ${WEEKS} weeks`}>
        <div className="flex gap-2">
          <div className="grid shrink-0 grid-rows-7 gap-1 text-[10px] leading-none text-mute">
            {WEEKDAY_DISPLAY_ORDER.map((wd) => (
              <span key={wd} className="flex items-center">
                {WEEKDAY_LABELS[wd]}
              </span>
            ))}
          </div>
          <div className="grid flex-1 grid-flow-col gap-1" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
            {weeks.map((week) => (
              <div key={week[0].date} className="grid grid-rows-7 gap-1">
                {week.map((day) => {
                  const ratio = day.due === 0 ? 0 : day.done / day.due;
                  const label = day.future
                    ? formatLong(day.date)
                    : `${formatLong(day.date)}: ${day.done} of ${day.due} habits${shielded.has(day.date) ? ', shield used' : ''}`;
                  return (
                    <div
                      key={day.date}
                      title={label}
                      aria-label={label}
                      className={`h-5 w-full rounded-[4px] sm:h-6 ${
                        day.date === today ? 'ring-2 ring-ink' : shielded.has(day.date) ? 'ring-2 ring-gold' : ''
                      }`}
                      style={{
                        background: day.future
                          ? 'transparent'
                          : ratio === 0
                            ? 'var(--color-raise)'
                            : `color-mix(in srgb, var(--color-glow) ${Math.round(20 + ratio * 80)}%, var(--color-raise))`,
                        border: day.future ? '1px dashed color-mix(in srgb, var(--color-edge) 60%, transparent)' : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] bg-raise" /> none
            <span className="size-3 rounded-[3px]" style={{ background: 'color-mix(in srgb, var(--color-glow) 55%, var(--color-raise))' }} /> some
            <span className="size-3 rounded-[3px] bg-glow" /> all habits done
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] ring-2 ring-gold" /> shield used
          </span>
        </p>
      </Panel>

      <Panel title="Habit records">
        {rows.length === 0 ? (
          <Empty>Your habits will be listed here once you add some.</Empty>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-14" />
              <col className="w-16" />
              <col className="w-14" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] text-mute">
                <th className="pb-2 font-medium">Habit</th>
                <th className="pb-2 text-right font-medium">Done</th>
                <th className="pb-2 text-right font-medium">Streak</th>
                <th className="pb-2 text-right font-medium">Best</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/50">
              {rows.map(({ habit, total }) => {
                const s = d.streaks[habit.id];
                const unit = s?.unit === 'weeks' ? 'w' : 'd';
                return (
                  <tr key={habit.id}>
                    <td className="py-2 pr-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0">
                          <StatIcon stat={habit.stat} size={14} />
                        </span>
                        <span className="truncate">{habit.name}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{total}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      <span className={`inline-flex items-center gap-0.5 ${s && s.current > 0 ? 'font-semibold text-[#ff9d5c]' : 'text-mute'}`}>
                        {s && s.current > 0 && <Flame size={13} />}
                        {s?.current ?? 0}
                        {unit}
                      </span>
                    </td>
                    <td className="py-2 pl-3 text-right text-mute tabular-nums">
                      {s?.best ?? 0}
                      {unit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
