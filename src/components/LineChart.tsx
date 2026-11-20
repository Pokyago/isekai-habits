import { useEffect, useMemo, useRef, useState } from 'react';
import type { DateStr } from '../data/types';
import { formatLong, formatShort, parseDate } from '../game/dates';

export interface ChartSeries {
  name: string;
  color: string;
  points: { date: DateStr; value: number }[];
}

/**
 * Series colours for charts, in fixed order. Checked with the data-viz palette
 * validator against the app's dark panel (#12162c): lightness band, chroma,
 * colour-blind separation and 3:1 contrast all pass.
 */
export const CHART_COLORS = ['#3987e5', '#d95926'];

const MARGIN = { top: 14, right: 58, bottom: 26 };
const DAY = 86_400_000;
const dayNumber = (date: DateStr) => Math.round(parseDate(date).getTime() / DAY);

/** Round tick values covering the data, about four of them. */
function ticksFor(min: number, max: number, decimals: number): number[] {
  const smallest = decimals > 0 ? 0.5 : 1;
  const raw = Math.max((max - min) / 3, smallest);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(smallest, [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw);
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (lo === hi) {
    lo -= step;
    hi += step;
  }
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/**
 * A line chart of measurements over time. Dates are placed by their real spacing,
 * so a skipped week shows as a gap in time rather than an evenly spaced point.
 * Hover, touch or the arrow keys read out the values on a date.
 */
export function LineChart({
  series,
  unit,
  decimals,
  format,
  formatValue = format,
  axisWidth = 44,
  height: HEIGHT = 220,
  reference,
  label,
}: {
  series: ChartSeries[];
  unit: string;
  decimals: number;
  /** Formats an axis tick. */
  format(value: number): string;
  /** Formats an exact value in the readout and the end label. Defaults to `format`. */
  formatValue?: (value: number) => string;
  /** Room for the axis labels on the left. */
  axisWidth?: number;
  height?: number;
  /** A level to compare against, drawn as a dashed line across the chart (a goal weight, say). */
  reference?: { value: number; label: string };
  /** Describes the chart for screen readers. */
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, el.clientWidth));
    measure();
    // Both, because a resize observer only reports while the page is being drawn.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const dates = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort(),
    [series],
  );
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (dates.length === 0) return null;
  // The scale stretches to take in the reference level, so the gap to it can be seen.
  if (reference) values.push(reference.value);

  const ticks = ticksFor(Math.min(...values), Math.max(...values), decimals);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x0 = dayNumber(dates[0]);
  const x1 = dayNumber(dates[dates.length - 1]);
  const left = axisWidth;
  const plotW = width - left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (date: DateStr) => left + (x1 === x0 ? plotW / 2 : ((dayNumber(date) - x0) / (x1 - x0)) * plotW);
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * plotH;

  const ends = series
    .filter((s) => s.points.length > 0)
    .map((s) => ({ s, p: s.points[s.points.length - 1] }));
  // End labels are only useful when they don't sit on top of each other; otherwise the legend and readout carry the values.
  const endLabelsFit = ends.every((a, i) => ends.every((b, j) => i === j || Math.abs(y(a.p.value) - y(b.p.value)) >= 14));

  const nearest = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < dates.length; i++) if (Math.abs(x(dates[i]) - px) < Math.abs(x(dates[best]) - px)) best = i;
    return best;
  };

  const activeDate = active !== null ? dates[Math.min(active, dates.length - 1)] : null;
  const readout = activeDate
    ? series.map((s) => ({ s, p: s.points.find((p) => p.date === activeDate) })).filter((r) => r.p)
    : [];
  const tipLeft = activeDate ? x(activeDate) : 0;
  const tipOnLeft = tipLeft > width * 0.6;

  return (
    <div>
      {(series.length > 1 || reference) && (
        <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
          {series.map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
          {reference && (
            <li className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-mute" />
              {reference.label}
            </li>
          )}
        </ul>
      )}
      <div
        ref={box}
        className="relative touch-pan-y overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-glow"
        // The drawing is positioned inside a box of fixed height, so its width never props the layout open.
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="img"
        aria-label={`${label}. Use the left and right arrow keys to read each date.`}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerDown={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((cur) => cur ?? dates.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          setActive((cur) => {
            const i = cur ?? dates.length - 1;
            return Math.min(dates.length - 1, Math.max(0, i + (e.key === 'ArrowLeft' ? -1 : 1)));
          });
        }}
      >
        <svg width={width} height={HEIGHT} className="absolute top-0 left-0 block" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="var(--color-edge)" strokeOpacity={0.55} strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-mute)">
                {format(t)}
              </text>
            </g>
          ))}
          <text x={left} y={HEIGHT - 6} fontSize={11} fill="var(--color-mute)">
            {formatShort(dates[0])}
          </text>
          {dates.length > 1 && (
            <text x={width - MARGIN.right} y={HEIGHT - 6} textAnchor="end" fontSize={11} fill="var(--color-mute)">
              {formatShort(dates[dates.length - 1])}
            </text>
          )}

          {reference && (
            <line
              x1={left}
              x2={width - MARGIN.right}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke="var(--color-mute)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          )}

          {activeDate && (
            <line x1={x(activeDate)} x2={x(activeDate)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} stroke="var(--color-mute)" strokeWidth={1} />
          )}

          {series.map((s) =>
            s.points.length > 1 ? (
              <path
                key={s.name}
                d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}

          {ends.map(({ s, p }) => (
            <g key={s.name}>
              <circle cx={x(p.date)} cy={y(p.value)} r={4} fill={s.color} stroke="var(--color-panel)" strokeWidth={2} />
              {endLabelsFit && (
                <text x={x(p.date) + 9} y={y(p.value)} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--color-ink)">
                  {formatValue(p.value)}
                </text>
              )}
            </g>
          ))}

          {readout.map(({ s, p }) => (
            <circle key={s.name} cx={x(p!.date)} cy={y(p!.value)} r={5} fill={s.color} stroke="var(--color-panel)" strokeWidth={2} />
          ))}
        </svg>

        {activeDate && readout.length > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-edge bg-raise px-3 py-2 text-xs shadow-lg"
            style={tipOnLeft ? { right: width - tipLeft + 10 } : { left: tipLeft + 10 }}
          >
            <p className="mb-1 whitespace-nowrap text-mute">{formatLong(activeDate)}</p>
            {readout.map(({ s, p }) => (
              <p key={s.name} className="flex items-center gap-2 whitespace-nowrap">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <strong className="text-sm text-ink tabular-nums">
                  {formatValue(p!.value)}
                  {unit && ` ${unit}`}
                </strong>
                {series.length > 1 && <span className="text-mute">{s.name}</span>}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
