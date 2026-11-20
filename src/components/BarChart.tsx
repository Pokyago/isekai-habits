import { useEffect, useRef, useState } from 'react';

export interface BarSeries {
  name: string;
  color: string;
  /** One value per category, in the same order. */
  values: number[];
}

const MARGIN = { top: 12, right: 8, bottom: 26 };
const MAX_BAR = 24;
const GAP = 2;

/** Round tick values from zero up to at least `max`, about four of them. */
function ticksTo(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step - step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** A bar with a rounded top and a square foot on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Columns for amounts per period (one or two series side by side), growing from a
 * shared zero baseline. Hover, touch or the arrow keys read out a period's values.
 */
export function BarChart({
  categories,
  series,
  format,
  formatValue = format,
  axisWidth = 44,
  height = 240,
  label,
}: {
  /** The periods along the bottom: a short label for the axis, a full one for the readout. */
  categories: { key: string; short: string; long: string }[];
  series: BarSeries[];
  /** Formats an axis tick. */
  format(value: number): string;
  /** Formats an exact value in the readout. Defaults to `format`. */
  formatValue?: (value: number) => string;
  axisWidth?: number;
  height?: number;
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
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const n = categories.length;
  if (n === 0) return null;

  const ticks = ticksTo(Math.max(0, ...series.flatMap((s) => s.values)));
  const yMax = ticks[ticks.length - 1];
  const plotW = width - axisWidth - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const band = plotW / n;
  const k = series.length;
  // Bars are capped at 24px; in a narrow band they shrink to fit with a gap between them.
  const bar = Math.max(2, Math.min(MAX_BAR, (band * 0.8 - GAP * (k - 1)) / k));
  const groupW = bar * k + GAP * (k - 1);
  const y = (v: number) => MARGIN.top + (1 - v / yMax) * plotH;
  const baseline = MARGIN.top + plotH;
  const bandX = (i: number) => axisWidth + i * band;
  // Show as many period labels as fit without touching.
  const every = Math.max(1, Math.ceil(42 / band));

  const indexAt = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor((clientX - rect.left - axisWidth) / band)));
  };
  const tipX = active !== null ? bandX(active) + band / 2 : 0;
  const tipOnLeft = tipX > width * 0.6;

  return (
    <div>
      {k > 1 && (
        <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
          {series.map((s) => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={box}
        className="relative touch-pan-y overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-glow"
        // The drawing is positioned inside a box of fixed height, so its width never props the layout open.
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={`${label}. Use the left and right arrow keys to read each period.`}
        onPointerMove={(e) => setActive(indexAt(e.clientX))}
        onPointerDown={(e) => setActive(indexAt(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((cur) => cur ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          setActive((cur) => Math.min(n - 1, Math.max(0, (cur ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
        }}
      >
        <svg width={width} height={height} className="absolute top-0 left-0 block" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={axisWidth} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="var(--color-edge)" strokeOpacity={t === 0 ? 1 : 0.55} strokeWidth={1} />
              <text x={axisWidth - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-mute)">
                {format(t)}
              </text>
            </g>
          ))}

          {active !== null && (
            <rect x={bandX(active)} y={MARGIN.top} width={band} height={plotH} fill="var(--color-ink)" fillOpacity={0.06} />
          )}

          {categories.map((c, i) => {
            const x0 = bandX(i) + (band - groupW) / 2;
            return (
              <g key={c.key}>
                {series.map((s, j) => {
                  const v = Math.max(0, s.values[i] ?? 0);
                  if (v === 0) return null;
                  const top = y(v);
                  return <path key={s.name} d={barPath(x0 + j * (bar + GAP), top, bar, baseline - top)} fill={s.color} />;
                })}
                {i % every === 0 && (
                  <text x={bandX(i) + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--color-mute)">
                    {c.short}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-edge bg-raise px-3 py-2 text-xs shadow-lg"
            style={tipOnLeft ? { right: width - tipX + band / 2 + 6 } : { left: tipX + band / 2 + 6 }}
          >
            <p className="mb-1 whitespace-nowrap text-mute capitalize">{categories[active].long}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-2 whitespace-nowrap">
                <span className="size-2.5 rounded-[2px]" style={{ background: s.color }} />
                <strong className="text-sm text-ink tabular-nums">{formatValue(s.values[active] ?? 0)}</strong>
                {k > 1 && <span className="text-mute">{s.name}</span>}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
