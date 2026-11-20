import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { CHART_COLORS, LineChart, type ChartSeries } from '../components/LineChart';
import { Button, Empty, Field, Modal, Panel, Segmented, inputClass } from '../components/ui';
import { useGame } from '../data/store';
import type { HealthEntry } from '../data/types';
import { addDays, daysBetween, formatLong, formatShort } from '../game/dates';
import {
  HEALTH_REWARD,
  METRICS,
  bmi,
  checkIns,
  checkedInThisWeek,
  latest,
  parseMeasurement,
  readings,
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

/** What can be charted: each single measurement, plus blood pressure as a pair. */
type ChartKey = Exclude<MetricKey, 'systolic' | 'diastolic'> | 'pressure';
const CHARTS: { key: ChartKey; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: 'restingBpm', label: 'Heart rate' },
  { key: 'pressure', label: 'Blood pressure' },
  { key: 'bodyFat', label: 'Body fat' },
  { key: 'waist', label: 'Waist' },
  { key: 'sleepHours', label: 'Sleep' },
];

type Range = '3m' | '6m' | '1y' | 'all';
const RANGES: { value: Range; label: string; days: number | null }[] = [
  { value: '3m', label: '3 months', days: 92 },
  { value: '6m', label: '6 months', days: 183 },
  { value: '1y', label: '1 year', days: 366 },
  { value: 'all', label: 'All', days: null },
];

/** The fields shown as tiles and in the form, in order. Blood pressure is handled as a pair between them. */
const SINGLE: Exclude<MetricKey, 'systolic' | 'diastolic'>[] = ['weight', 'restingBpm', 'bodyFat', 'waist', 'sleepHours'];

export function Health() {
  const data = useGame((s) => s.data);
  const today = useToday();
  const num = useNumber();
  const entries = useMemo(() => checkIns(data), [data]);
  const [form, setForm] = useState<{ entry?: HealthEntry } | null>(null);
  const [chart, setChart] = useState<ChartKey>('weight');
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

  const series = useMemo((): ChartSeries[] => {
    const days = RANGES.find((r) => r.value === range)!.days;
    const from = days === null ? '' : addDays(today, -days);
    const inRange = entries.filter((e) => e.date >= from);
    if (chart === 'pressure') {
      return [
        { name: 'Systolic', color: CHART_COLORS[0], points: readings(inRange, 'systolic') },
        { name: 'Diastolic', color: CHART_COLORS[1], points: readings(inRange, 'diastolic') },
      ];
    }
    return [{ name: METRICS[chart].name, color: CHART_COLORS[0], points: readings(inRange, chart) }];
  }, [entries, chart, range, today]);
  const chartMetric = chart === 'pressure' ? METRICS.systolic : METRICS[chart];
  const chartHasData = series.some((s) => s.points.length > 0);

  const delta = (last: number, previous: number | undefined, decimals: number, since: string | undefined) => {
    if (previous === undefined || !since) return 'first reading';
    const diff = last - previous;
    if (Math.abs(diff) < 10 ** -decimals / 2) return `same as ${formatShort(since)}`;
    return `${diff > 0 ? '+' : '−'}${num(Math.abs(diff), decimals)} since ${formatShort(since)}`;
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex items-center justify-between lg:col-span-2">
        <h1 className="font-display text-2xl font-bold">Health</h1>
        <Button variant="gold" onClick={openCheckIn}>
          <Plus size={16} /> Check in
        </Button>
      </div>

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

      {entries.length > 0 && (
        <Panel title="Latest">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              <div className="rounded-lg border border-edge/70 bg-void/40 p-3">
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
              <div className="rounded-lg border border-edge/70 bg-void/40 p-3">
                <dt className="text-[11px] text-mute">BMI</dt>
                <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">
                  {num(bmi(weight.last.value, profile.heightCm), 1)}
                </dd>
                <dd className="mt-0.5 text-[11px] text-mute">from weight and height</dd>
              </div>
            )}
            {SINGLE.slice(2).map((key) => (
              <Tile key={key} metric={key} entries={entries} num={num} delta={delta} />
            ))}
          </dl>
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel title="Trend" className="lg:col-start-2 lg:row-span-2 lg:row-start-2">
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              className={`${inputClass} w-auto min-w-40 flex-1`}
              value={chart}
              onChange={(e) => setChart(e.target.value as ChartKey)}
              aria-label="Measurement to chart"
            >
              {CHARTS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="min-w-64 flex-[2]">
              <Segmented<Range> label="Time range" value={range} onChange={setRange} options={RANGES} />
            </div>
          </div>
          {chartHasData ? (
            <>
              <p className="mb-1 text-xs text-mute">
                {CHARTS.find((c) => c.key === chart)!.label}, in {chartMetric.unit}
              </p>
              <LineChart
                series={series}
                unit={chartMetric.unit}
                decimals={chartMetric.decimals}
                format={(v) => num(v, Number.isInteger(v) ? 0 : chartMetric.decimals)}
                label={`${CHARTS.find((c) => c.key === chart)!.label} over time`}
              />
            </>
          ) : (
            <Empty>Nothing recorded for this in the chosen period.</Empty>
          )}
        </Panel>
      )}

      {entries.length > 0 && (
        <Panel title="Check-ins" right={<span className="text-xs text-mute">{entries.length}</span>}>
          <ul className="space-y-1">
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

      {form && <CheckInForm entry={form.entry} onClose={() => setForm(null)} />}
    </div>
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
    <div className="rounded-lg border border-edge/70 bg-void/40 p-3">
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
          <input className={`${inputClass} w-28`} inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 178" />
        </Field>
        <Field label="Goal weight (kg), optional">
          <input className={`${inputClass} w-28`} inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 75" />
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
