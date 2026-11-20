import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CHART_COLORS, LineChart, type ChartSeries } from '../components/LineChart';
import { Button, Empty, Field, Modal, Panel, Segmented, inputBase, inputClass } from '../components/ui';
import { useGame } from '../data/store';
import type { HealthEntry } from '../data/types';
import { WEEKDAY_LABELS } from '../data/meta';
import { addDays, daysBetween, formatLong, formatShort, weekday } from '../game/dates';
import {
  HEALTH_REWARD,
  METRICS,
  SLEEP_REWARD,
  averageSleep,
  bmi,
  checkIns,
  checkedInThisWeek,
  formatSleep,
  latest,
  parseMeasurement,
  parseSleep,
  readings,
  rollingSleep,
  sleepInputText,
  sleepLogs,
  type Measurements,
  type MetricKey,
} from '../health/health';
import { useToday } from '../hooks';
import { CURRENCIES } from '../money/format';

/** Numbers written the way the user's money is (comma or dot), so the whole app agrees. */
function useNumber() {
  const currency = useGame((s) => s.data.money?.currency);
  const locale = currency ? CURRENCIES[currency]?.locale : undefined;
  return useCallback(
    (value: number, decimals: number) =>
      value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [locale],
  );
}

/** What gets its own chart: each single measurement, plus blood pressure as a pair. Sleep is charted from the nightly log. */
type ChartKey = Exclude<MetricKey, 'systolic' | 'diastolic' | 'sleepHours'> | 'pressure';
/** Charts that keep their place on the page even before they have anything to draw. */
const ALWAYS: ChartKey[] = ['weight', 'restingBpm', 'pressure'];
const CHARTS: { key: ChartKey; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: 'restingBpm', label: 'Resting heart rate' },
  { key: 'pressure', label: 'Blood pressure' },
  { key: 'bodyFat', label: 'Body fat' },
  { key: 'waist', label: 'Waist' },
];

type Range = '1m' | '3m' | '6m' | '1y' | 'all';
const RANGES: { value: Range; label: string; days: number | null }[] = [
  { value: '1m', label: '1 month', days: 31 },
  { value: '3m', label: '3 months', days: 92 },
  { value: '6m', label: '6 months', days: 183 },
  { value: '1y', label: '1 year', days: 366 },
  { value: 'all', label: 'All', days: null },
];

/** The fields shown as tiles and in the form, in order. Blood pressure is handled as a pair between them. */
const SINGLE: Exclude<MetricKey, 'systolic' | 'diastolic'>[] = ['weight', 'restingBpm', 'bodyFat', 'waist', 'sleepHours'];

const tile = 'rounded-lg border border-edge/70 bg-void/40 p-3';

export function Health() {
  const data = useGame((s) => s.data);
  const today = useToday();
  const num = useNumber();
  const entries = useMemo(() => checkIns(data), [data]);
  const nights = useMemo(() => sleepLogs(data), [data]);
  const [form, setForm] = useState<{ entry?: HealthEntry } | null>(null);
  const [range, setRange] = useState<Range>('6m');

  const doneThisWeek = checkedInThisWeek(data, today);
  const lastEntry = entries[entries.length - 1];
  const openCheckIn = () => setForm({ entry: data.health[today]?.deleted ? undefined : data.health[today] });

  const pressure = useMemo(() => {
    const both = entries.filter((e) => e.systolic !== null && e.diastolic !== null);
    return { last: both[both.length - 1] ?? null, previous: both[both.length - 2] ?? null };
  }, [entries]);
  const weight = latest(entries, 'weight');
  const profile = data.healthProfile;
  const weekSleep = averageSleep(nights, today);

  // One chart per measurement that has anything in the chosen period.
  const charts = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)!.days;
    const from = days === null ? '' : addDays(today, -days);
    const inRange = entries.filter((e) => e.date >= from);
    const list: {
      key: string;
      label: string;
      unit: string;
      decimals: number;
      series: ChartSeries[];
      sleep?: boolean;
      /** Shown in place of the drawing while there is nothing to draw. */
      empty?: string;
    }[] = [];

    for (const c of CHARTS) {
      const metric = c.key === 'pressure' ? METRICS.systolic : METRICS[c.key];
      const series: ChartSeries[] =
        c.key === 'pressure'
          ? [
              { name: 'Systolic', color: CHART_COLORS[0], points: readings(inRange, 'systolic') },
              { name: 'Diastolic', color: CHART_COLORS[1], points: readings(inRange, 'diastolic') },
            ]
          : [{ name: c.label, color: CHART_COLORS[0], points: readings(inRange, c.key) }];
      if (series.some((s) => s.points.length > 0)) {
        list.push({ key: c.key, label: c.label, unit: metric.unit, decimals: metric.decimals, series });
      } else if (ALWAYS.includes(c.key) && readings(entries, metric.key).length === 0) {
        // Never measured: show the empty frame, so it is clear what a check-in will draw.
        list.push({
          key: c.key,
          label: c.label,
          unit: metric.unit,
          decimals: metric.decimals,
          series: [],
          empty: `No ${c.label.toLowerCase()} recorded yet. Add it in a check-in and the line starts here.`,
        });
      }
    }

    const loggedNights = nights.filter((n) => n.date >= from);
    if (loggedNights.length > 0) {
      const series: ChartSeries[] = [
        { name: 'Each night', color: CHART_COLORS[0], points: loggedNights.map((n) => ({ date: n.date, value: n.hours })) },
      ];
      // The weekly average only says something once there are a few nights to average.
      if (loggedNights.length >= 4) {
        series.push({ name: '7-night average', color: CHART_COLORS[1], points: rollingSleep(nights).filter((p) => p.date >= from) });
      }
      list.push({ key: 'sleep', label: 'Sleep', unit: 'hours', decimals: 1, series, sleep: true });
    } else {
      const weekly = readings(inRange, 'sleepHours');
      if (weekly.length > 0) {
        list.push({
          key: 'sleep',
          label: 'Sleep (weekly average)',
          unit: 'hours',
          decimals: 1,
          series: [{ name: 'Sleep', color: CHART_COLORS[0], points: weekly }],
          sleep: true,
        });
      } else if (nights.length === 0 && readings(entries, 'sleepHours').length === 0) {
        list.push({
          key: 'sleep',
          label: 'Sleep',
          unit: 'hours',
          decimals: 1,
          series: [],
          sleep: true,
          empty: 'No nights logged yet. Log last night above and the line starts here.',
        });
      }
    }
    return list;
  }, [entries, nights, range, today]);
  const goalWeight = profile?.goalWeight ?? null;

  const delta = (last: number, previous: number | undefined, decimals: number, since: string | undefined) => {
    if (previous === undefined || !since) return 'first reading';
    const diff = last - previous;
    if (Math.abs(diff) < 10 ** -decimals / 2) return `same as ${formatShort(since)}`;
    return `${diff > 0 ? '+' : '−'}${num(Math.abs(diff), decimals)} since ${formatShort(since)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Health</h1>
        <Button variant="gold" onClick={openCheckIn}>
          <Plus size={16} /> Check in
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="This week">
          <p className="text-sm">
            {doneThisWeek
              ? `Done. You checked in on ${formatLong(lastEntry.date)}.`
              : lastEntry
                ? `No check-in yet this week. The last one was ${daysBetween(lastEntry.date, today)} days ago.`
                : 'Record your weight, resting heart rate, blood pressure and anything else you measure. Once a week is plenty.'}
          </p>
          <p className="mt-1.5 text-xs text-mute">
            The first check-in of each week earns +{HEALTH_REWARD.xp} Vitality XP and +{HEALTH_REWARD.gold} gold. This
            page only records what you enter; it is not medical advice.
          </p>
        </Panel>
        <SleepPanel />
      </div>

      {(entries.length > 0 || weekSleep !== null) && (
        <Panel title="Latest">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {SINGLE.slice(0, 2).map((key) => (
              <Tile key={key} metric={key} entries={entries} num={num} delta={delta}>
                {key === 'weight' && weight.last && profile?.goalWeight != null && (
                  <span className="block">
                    {Math.abs(weight.last.value - profile.goalWeight) < 0.05
                      ? 'at your goal'
                      : `${num(Math.abs(weight.last.value - profile.goalWeight), 1)} kg ${weight.last.value > profile.goalWeight ? 'above' : 'below'} your goal`}
                  </span>
                )}
              </Tile>
            ))}
            {pressure.last && (
              <div className={tile}>
                <dt className="text-[11px] text-mute">Blood pressure</dt>
                <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">
                  {pressure.last.systolic}/{pressure.last.diastolic}
                  <span className="ml-1 text-xs font-normal text-mute">mmHg</span>
                </dd>
                <dd className="mt-0.5 text-[11px] text-mute">
                  {pressure.previous
                    ? `was ${pressure.previous.systolic}/${pressure.previous.diastolic} on ${formatShort(pressure.previous.date)}`
                    : 'first reading'}
                </dd>
              </div>
            )}
            {weight.last && profile?.heightCm != null && (
              <div className={tile}>
                <dt className="text-[11px] text-mute">BMI</dt>
                <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">
                  {num(bmi(weight.last.value, profile.heightCm), 1)}
                </dd>
                <dd className="mt-0.5 text-[11px] text-mute">from weight and height</dd>
              </div>
            )}
            {SINGLE.slice(2, 4).map((key) => (
              <Tile key={key} metric={key} entries={entries} num={num} delta={delta} />
            ))}
            {weekSleep !== null ? (
              <div className={tile}>
                <dt className="text-[11px] text-mute">Sleep, last 7 nights</dt>
                <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">{formatSleep(weekSleep)}</dd>
                <dd className="mt-0.5 text-[11px] text-mute">average of the nights you logged</dd>
              </div>
            ) : (
              <Tile metric="sleepHours" entries={entries} num={num} delta={delta} />
            )}
          </dl>
        </Panel>
      )}

      <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Trends</h2>
            <div className="min-w-72 max-w-xl flex-1">
              <Segmented<Range> label="Time range" value={range} onChange={setRange} options={RANGES} />
            </div>
          </div>
          {charts.length === 0 ? (
            <Panel>
              <Empty>Nothing recorded in this period.</Empty>
            </Panel>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-2 3xl:grid-cols-3">
              {charts.map((c) => (
                <Panel key={c.key} title={c.label} right={<span className="text-xs text-mute">{c.unit}</span>}>
                  {c.empty ? (
                    <EmptyChart height={210}>{c.empty}</EmptyChart>
                  ) : (
                    <LineChart
                      series={c.series}
                      unit={c.sleep ? '' : c.unit}
                      decimals={c.decimals}
                      format={(v) => num(v, Number.isInteger(v) ? 0 : c.decimals)}
                      formatValue={c.sleep ? formatSleep : (v) => num(v, c.decimals)}
                      height={210}
                      reference={
                        c.key === 'weight' && goalWeight !== null
                          ? { value: goalWeight, label: `Goal ${num(goalWeight, 1)} kg` }
                          : undefined
                      }
                      label={`${c.label} over time`}
                    />
                  )}
                </Panel>
              ))}
            </div>
          )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {entries.length > 0 && (
          <Panel title="Check-ins" right={<span className="text-xs text-mute">{entries.length}</span>}>
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {[...entries].reverse().map((e) => {
                const parts = [
                  e.weight !== null && `${num(e.weight, 1)} kg`,
                  e.restingBpm !== null && `${e.restingBpm} bpm`,
                  e.systolic !== null && e.diastolic !== null && `${e.systolic}/${e.diastolic}`,
                  e.bodyFat !== null && `${num(e.bodyFat, 1)}% fat`,
                  e.waist !== null && `${num(e.waist, 1)} cm waist`,
                  e.sleepHours !== null && `${num(e.sleepHours, 1)} h sleep`,
                ].filter(Boolean);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setForm({ entry: e })}
                      className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-raise"
                    >
                      <span className="w-28 shrink-0 text-sm font-medium">{formatShort(e.date)}</span>
                      <span className="min-w-0 flex-1 text-sm text-mute tabular-nums">
                        {parts.join(' · ')}
                        {e.note && <span className="block truncate text-xs">{e.note}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
        <ProfilePanel />
      </div>

      {form && <CheckInForm entry={form.entry} onClose={() => setForm(null)} />}
    </div>
  );
}

/** The frame of a chart with nothing drawn in it yet, and a line saying what will fill it. */
function EmptyChart({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ height }}>
      <div className="absolute inset-x-0 top-3 bottom-7 flex flex-col justify-between" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="border-t border-edge/55" />
        ))}
      </div>
      <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-mute">{children}</p>
    </div>
  );
}

/** Log a night's sleep, and see the last week at a glance. */
function SleepPanel() {
  const data = useGame((s) => s.data);
  const saveSleep = useGame((s) => s.saveSleep);
  const deleteSleep = useGame((s) => s.deleteSleep);
  const today = useToday();
  const nights = useMemo(() => sleepLogs(data), [data]);
  const byDate = useMemo(() => new Map(nights.map((n) => [n.date, n])), [nights]);

  const [date, setDate] = useState(today);
  const [text, setText] = useState(() => (byDate.get(today) ? sleepInputText(byDate.get(today)!.hours) : ''));
  const pick = (d: string) => {
    setDate(d);
    const log = byDate.get(d);
    setText(log ? sleepInputText(log.hours) : '');
  };

  const hours = parseSleep(text);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const existing = byDate.get(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const average = averageSleep(nights, today);

  return (
    <Panel title="Sleep" right={average !== null ? <span className="text-xs text-mute">7-night average {formatSleep(average)}</span> : undefined}>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (hours !== null && dateOk) saveSleep(date, hours);
        }}
      >
        <Field label="Morning you woke up">
          <input type="date" className={`${inputBase} w-40`} value={date} max={today} onChange={(e) => pick(e.target.value)} />
        </Field>
        <Field label="Slept for">
          <input
            className={`${inputBase} w-28 ${text.trim() !== '' && hours === null ? 'border-danger' : ''}`}
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="7:30"
            aria-label="Hours slept"
          />
        </Field>
        <Button variant="primary" type="submit" disabled={hours === null || !dateOk || existing?.hours === hours}>
          {existing ? 'Update' : 'Log'}
        </Button>
        {existing && (
          <Button
            variant="ghost"
            onClick={() => {
              deleteSleep(date);
              setText('');
            }}
          >
            Remove
          </Button>
        )}
      </form>

      <ul className="mt-4 grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const log = byDate.get(d);
          const selected = d === date;
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => pick(d)}
                aria-pressed={selected}
                title={log ? `${formatLong(d)}: ${formatSleep(log.hours)}` : `${formatLong(d)}: not logged`}
                className={`flex w-full flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] transition-colors ${
                  selected ? 'border-glow bg-glow/10' : 'border-edge/60 hover:border-mute'
                }`}
              >
                <span className="text-mute">{d === today ? 'Today' : WEEKDAY_LABELS[weekday(d)]}</span>
                <span className="flex h-12 w-2.5 items-end overflow-hidden rounded-full bg-void/80">
                  <span
                    className="w-full rounded-full transition-[height] duration-500"
                    style={{ height: `${log ? Math.min(100, (log.hours / 10) * 100) : 0}%`, background: CHART_COLORS[0] }}
                  />
                </span>
                <span className={`tabular-nums ${log ? 'font-semibold' : 'text-mute'}`}>{log ? sleepInputText(log.hours) : '–'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-mute">
        Type it as 7:30, 7h30 or 7,5. Logging last night earns +{SLEEP_REWARD.xp} Vitality XP and +{SLEEP_REWARD.gold}{' '}
        gold; tap a day to fill in or correct an earlier night.
      </p>
    </Panel>
  );
}

function Tile({
  metric,
  entries,
  num,
  delta,
  children,
}: {
  metric: Exclude<MetricKey, 'systolic' | 'diastolic'>;
  entries: HealthEntry[];
  num(value: number, decimals: number): string;
  delta(last: number, previous: number | undefined, decimals: number, since: string | undefined): string;
  children?: ReactNode;
}) {
  const m = METRICS[metric];
  const { last, previous } = latest(entries, metric);
  if (!last) return null;
  return (
    <div className={tile}>
      <dt className="text-[11px] text-mute">{m.name}</dt>
      <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">
        {num(last.value, m.decimals)}
        <span className="ml-1 text-xs font-normal text-mute">{m.unit}</span>
      </dd>
      <dd className="mt-0.5 text-[11px] text-mute">
        {delta(last.value, previous?.value, m.decimals, previous?.date)}
        {children}
      </dd>
    </div>
  );
}

function ProfilePanel() {
  const profile = useGame((s) => s.data.healthProfile);
  const saveHealthProfile = useGame((s) => s.saveHealthProfile);
  const [height, setHeight] = useState(profile?.heightCm != null ? String(profile.heightCm) : '');
  const [goal, setGoal] = useState(profile?.goalWeight != null ? String(profile.goalWeight).replace('.', ',') : '');

  const h = parseMeasurement(height, { ...METRICS.waist, min: 80, max: 250, decimals: 0 });
  const g = parseMeasurement(goal, METRICS.weight);
  const valid = h !== 'invalid' && g !== 'invalid';
  const changed = valid && (h !== (profile?.heightCm ?? null) || g !== (profile?.goalWeight ?? null));

  return (
    <Panel title="About you">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) saveHealthProfile({ heightCm: h, goalWeight: g });
        }}
      >
        <Field label="Height (cm)">
          <input className={`${inputBase} w-28`} inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 178" />
        </Field>
        <Field label="Goal weight (kg), optional">
          <input className={`${inputBase} w-28`} inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 75" />
        </Field>
        <Button type="submit" disabled={!changed}>
          Save
        </Button>
      </form>
      <p className="mt-2 text-xs text-mute">
        {valid ? 'Height is used to work out your BMI from each weight.' : 'One of these doesn’t look right. Check the numbers.'}
      </p>
    </Panel>
  );
}

function CheckInForm({ entry, onClose }: { entry?: HealthEntry; onClose(): void }) {
  const data = useGame((s) => s.data);
  const saveCheckIn = useGame((s) => s.saveCheckIn);
  const deleteCheckIn = useGame((s) => s.deleteCheckIn);
  const today = useToday();
  const num = useNumber();
  const entries = useMemo(() => checkIns(data), [data]);

  const initial = (key: MetricKey) => {
    const v = entry?.[key];
    return v === null || v === undefined ? '' : String(v).replace('.', ',');
  };
  const [date, setDate] = useState(entry?.date ?? today);
  const [text, setText] = useState<Record<MetricKey, string>>({
    weight: initial('weight'),
    restingBpm: initial('restingBpm'),
    systolic: initial('systolic'),
    diastolic: initial('diastolic'),
    bodyFat: initial('bodyFat'),
    waist: initial('waist'),
    sleepHours: initial('sleepHours'),
  });
  const [note, setNote] = useState(entry?.note ?? '');
  const set = (key: MetricKey, value: string) => setText((cur) => ({ ...cur, [key]: value }));

  const parsed = Object.fromEntries(
    (Object.keys(text) as MetricKey[]).map((k) => [k, parseMeasurement(text[k], METRICS[k])]),
  ) as Record<MetricKey, number | null | 'invalid'>;
  const invalid = (k: MetricKey) => parsed[k] === 'invalid';
  const anyInvalid = (Object.keys(parsed) as MetricKey[]).some(invalid);
  const anyValue = (Object.keys(parsed) as MetricKey[]).some((k) => typeof parsed[k] === 'number');
  const halfPressure = (parsed.systolic === null) !== (parsed.diastolic === null);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const valid = dateOk && anyValue && !anyInvalid && !halfPressure;
  const replaces = !entry && dateOk && data.health[date] && !data.health[date].deleted;

  /** The last value recorded, shown faintly so it is easy to see what changed. */
  const hint = (key: MetricKey) => {
    const last = latest(entries.filter((e) => e.id !== entry?.id), key).last;
    return last ? `last: ${num(last.value, METRICS[key].decimals)}` : '';
  };
  const field = (key: MetricKey) => `${inputClass} ${invalid(key) ? 'border-danger focus:border-danger' : ''}`;

  return (
    <Modal title={entry ? 'Edit check-in' : 'Health check-in'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveCheckIn({ ...(parsed as Measurements), date, note });
          onClose();
        }}
      >
        <p className="text-sm text-mute">Fill in what you measured and leave the rest empty.</p>
        <Field label="Date">
          <input type="date" className={inputClass} value={date} max={today} disabled={!!entry} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)">
            <input className={field('weight')} inputMode="decimal" value={text.weight} onChange={(e) => set('weight', e.target.value)} placeholder={hint('weight')} autoFocus={!entry} />
          </Field>
          <Field label="Resting heart rate (bpm)">
            <input className={field('restingBpm')} inputMode="numeric" value={text.restingBpm} onChange={(e) => set('restingBpm', e.target.value)} placeholder={hint('restingBpm')} />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-mute">Blood pressure (mmHg)</span>
          <div className="flex items-center gap-2">
            <input className={field('systolic')} inputMode="numeric" aria-label="Systolic, the higher number" value={text.systolic} onChange={(e) => set('systolic', e.target.value)} placeholder={hint('systolic') || 'e.g. 120'} />
            <span className="text-lg text-mute">/</span>
            <input className={field('diastolic')} inputMode="numeric" aria-label="Diastolic, the lower number" value={text.diastolic} onChange={(e) => set('diastolic', e.target.value)} placeholder={hint('diastolic') || 'e.g. 80'} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Body fat (%)">
            <input className={field('bodyFat')} inputMode="decimal" value={text.bodyFat} onChange={(e) => set('bodyFat', e.target.value)} placeholder={hint('bodyFat')} />
          </Field>
          <Field label="Waist (cm)">
            <input className={field('waist')} inputMode="decimal" value={text.waist} onChange={(e) => set('waist', e.target.value)} placeholder={hint('waist')} />
          </Field>
          <Field label="Sleep a night (hours)">
            <input className={field('sleepHours')} inputMode="decimal" value={text.sleepHours} onChange={(e) => set('sleepHours', e.target.value)} placeholder={hint('sleepHours')} />
          </Field>
        </div>

        <Field label="Note (optional)">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="e.g. measured after a run, had a cold" />
        </Field>

        {anyInvalid && <p className="text-sm text-danger">A number marked in red doesn’t look right. Check for a missing comma.</p>}
        {halfPressure && !anyInvalid && <p className="text-sm text-danger">Blood pressure needs both numbers.</p>}
        {!dateOk && <p className="text-sm text-danger">The date can’t be in the future.</p>}
        {replaces && <p className="text-sm text-gold">There is already a check-in on this date. Saving replaces it.</p>}

        <div className="flex items-center gap-2 pt-1">
          {entry && (
            <Button
              variant="danger"
              onClick={() => {
                deleteCheckIn(entry.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {entry ? 'Save changes' : 'Save check-in'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
