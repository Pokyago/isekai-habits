import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { DayColumn, MOOD_COLOR } from '../components/Companion';
import { Heroine } from '../components/Heroine';
import { CHART_COLORS, LineChart } from '../components/LineChart';
import { Bar, Empty, IconButton, Panel } from '../components/ui';
import { CLASSES, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { MOODS, moodFor } from '../game/companion';
import { addDays, formatShort, weekStart } from '../game/dates';
import { firstWeek, moraleHistory, weekReview, weekVerdict } from '../game/review';
import { outfitOf } from '../game/wardrobe';
import { formatSleep } from '../health/health';
import { useToday } from '../hooks';
import { DEFAULT_CURRENCY, formatMoney } from '../money/format';

/**
 * A week looked back on, Monday to Sunday: how the habits went day by day and one by
 * one, what else got done, and how the heroine has been feeling over the last month.
 */
export function Review() {
  const data = useGame((s) => s.data);
  const today = useToday();
  // How many weeks back from this one.
  const [back, setBack] = useState(0);

  const thisWeek = weekStart(today);
  const start = addDays(thisWeek, -7 * back);
  const week = useMemo(() => weekReview(data, start, today), [data, start, today]);
  const before = useMemo(() => weekReview(data, addDays(start, -7), today), [data, start, today]);
  const history = useMemo(() => moraleHistory(data, today), [data, today]);
  const outfit = useMemo(() => outfitOf(data), [data]);
  const canGoBack = addDays(start, -7) >= firstWeek(data, today);

  const mood = moodFor(week.morale);
  const color = MOOD_COLOR[mood];
  const accent = statColor(data.hero ? CLASSES[data.hero.heroClass].stat : 'spi');
  const percent = week.share === null ? null : Math.round(week.share * 100);
  const change =
    week.share !== null && before.share !== null ? Math.round(week.share * 100) - Math.round(before.share * 100) : null;
  const title = back === 0 ? 'This week' : back === 1 ? 'Last week' : `${formatShort(week.start)} – ${formatShort(week.end)}`;
  const currency = data.money?.currency ?? DEFAULT_CURRENCY;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-1">
        <IconButton label="The week before" onClick={() => setBack(back + 1)} disabled={!canGoBack}>
          <ChevronLeft size={20} />
        </IconButton>
        <div className="min-w-44 text-center">
          <h1 className="font-display text-2xl leading-tight font-bold">{title}</h1>
          <p className="text-xs text-mute">
            {formatShort(week.start)} – {formatShort(week.end)}
            {back === 0 && ', so far'}
          </p>
        </div>
        <IconButton label="The week after" onClick={() => setBack(back - 1)} disabled={back === 0}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel>
          <div className="flex items-center gap-3 lg:flex-col lg:text-center">
            <div className="h-36 w-28 shrink-0 lg:h-48 lg:w-40">
              <Heroine mood={mood} accent={accent} tone={color} outfit={outfit} className="size-full" />
            </div>
            <div className="min-w-0 flex-1 lg:w-full">
              <p className="font-display text-lg leading-snug font-bold">{weekVerdict(week.share)}</p>
              <p className="mt-1 text-sm text-mute">
                She {back === 0 ? 'is' : 'ended the week'}{' '}
                <span className="font-semibold" style={{ color }}>
                  {MOODS[mood].name.toLowerCase()}
                </span>
                , morale {week.morale}.
              </p>
              {percent !== null && (
                <div className="mt-3">
                  <Bar value={percent} max={100} color={color} className="h-2.5" />
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="The week in numbers">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <Tile label="Habits kept" value={percent === null ? '–' : `${percent}%`}>
              {week.due > 0 && `${week.done} of ${week.due}`}
              {change !== null && change !== 0 && (
                <span className={change > 0 ? 'text-[var(--stat-vit)]' : 'text-danger'}>
                  {week.due > 0 && ' · '}
                  {change > 0 ? '▲' : '▼'} {Math.abs(change)} {Math.abs(change) === 1 ? 'point' : 'points'}
                </span>
              )}
            </Tile>
            <Tile label="Flawless days" value={week.flawless} />
            <Tile label="XP earned" value={week.xp.toLocaleString()} />
            <Tile label="Quests finished" value={week.quests} />
            <Tile label="Main goals" value={week.goalsSet === 0 ? '–' : `${week.goalsMet}/${week.goalsSet}`}>
              {week.goalsSet === 0 ? 'none set' : 'achieved'}
            </Tile>
            <Tile label="Meals as planned" value={week.mealsPlanned === 0 ? '–' : `${week.mealsEaten}/${week.mealsPlanned}`}>
              {week.mealsPlanned === 0 && 'none planned'}
            </Tile>
            <Tile label="Sleep, a night" value={week.sleepAverage === null ? '–' : formatSleep(week.sleepAverage)}>
              {week.sleepNights === 0 ? 'not logged' : `${week.sleepNights} ${week.sleepNights === 1 ? 'night' : 'nights'} logged`}
            </Tile>
            {week.money && (
              <Tile label="Spent" value={formatMoney(week.money.spent, currency)}>
                {week.money.income > 0 && `${formatMoney(week.money.income, currency)} came in`}
              </Tile>
            )}
          </dl>
        </Panel>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Day by day">
          <ol className="flex gap-1.5">
            {week.days.map((day) => (
              <DayColumn key={day.date} day={day.ahead ? { ...day, due: 0, done: 0 } : day} today={day.date === today} dim={day.ahead} />
            ))}
          </ol>
          <p className="mt-3 text-xs text-mute">Habits done out of those scheduled for each day.</p>
        </Panel>

        <Panel title="Habit by habit" right={<span className="text-xs text-mute">slipped most first</span>}>
          {week.habits.length === 0 ? (
            <Empty>No habits were scheduled this week.</Empty>
          ) : (
            <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {week.habits.map((h) => {
                const kept = h.done >= h.due;
                return (
                  <li key={h.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{h.name}</span>
                      <span className={`inline-flex shrink-0 items-center gap-1 text-xs tabular-nums ${kept ? 'text-gold' : 'text-mute'}`}>
                        {kept && <Check size={12} strokeWidth={3} />}
                        {h.done}/{h.due}
                      </span>
                    </div>
                    <Bar value={h.done} max={h.due} color={statColor(h.stat)} className="h-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Her morale, the last 4 weeks">
        {history.length < 2 ? (
          <Empty>Her morale will be charted here once there are a few days to show.</Empty>
        ) : (
          <LineChart
            series={[{ name: 'Morale', color: CHART_COLORS[0], points: history }]}
            unit=""
            decimals={0}
            format={(v) => String(Math.round(v))}
            axisWidth={34}
            height={200}
            label={`The heroine’s morale each day, from ${formatShort(history[0].date)} to ${formatShort(history[history.length - 1].date)}; it is ${history[history.length - 1].value} now`}
          />
        )}
        <p className="mt-2 text-xs text-mute">
          85 and up is radiant, 65 cheerful, 40 steady, 20 tired; below that she is exhausted.
        </p>
      </Panel>
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-edge/70 bg-void/40 p-3">
      <dt className="text-[11px] text-mute">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</dd>
      {children && <dd className="mt-0.5 text-[11px] text-mute">{children}</dd>}
    </div>
  );
}
