import { BookOpen, Coins, Heart, Sparkles, Sword, Target, X, type LucideIcon } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { statColor } from '../data/meta';
import type { StatKey } from '../data/types';

export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-edge bg-panel/85 shadow-[0_0_28px_rgba(111,214,255,0.05)] backdrop-blur-sm ${className}`}
    >
      {title && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-edge/70 px-4 py-2">
          <h2 className="text-[11px] font-semibold tracking-[0.2em] text-glow uppercase">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Variant = 'default' | 'primary' | 'gold' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  default: 'border border-edge bg-raise text-ink hover:border-glow/60',
  primary: 'border border-glow/70 bg-glow/15 text-glow hover:bg-glow/25',
  gold: 'border border-gold/70 bg-gold/15 text-gold hover:bg-gold/25',
  ghost: 'text-mute hover:text-ink hover:bg-raise',
  danger: 'border border-danger/60 bg-danger/10 text-danger hover:bg-danger/20',
};

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function IconButton({
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-mute transition-colors hover:bg-raise hover:text-ink disabled:opacity-30 ${className}`}
    />
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-modal max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-edge bg-panel pb-[env(safe-area-inset-bottom)] sm:rounded-2xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-edge/70 bg-panel px-4 py-2">
          <h2 className="text-[11px] font-semibold tracking-[0.2em] text-glow uppercase">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Bar({ value, max, color = 'var(--color-glow)', className = '' }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-void/80 ring-1 ring-edge/60 ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </div>
  );
}

/** A circular progress ring with something in the middle. */
export function Ring({
  value,
  max,
  size = 44,
  stroke = 4,
  color = 'var(--color-glow)',
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const around = 2 * Math.PI * r;
  const part = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-edge)" strokeOpacity={0.7} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={around}
          strokeDashoffset={around * (1 - part)}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out, stroke 0.3s', filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-edge/80 px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap text-mute"
      style={color ? { color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` } : undefined}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mute">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'min-h-10 w-full rounded-lg border border-edge bg-void/70 px-3 text-sm text-ink placeholder:text-mute/60 focus:border-glow focus:outline-none';

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode; color?: string }[];
  value: T;
  onChange(value: T): void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-10 flex-1 rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              on ? 'border-glow bg-glow/15 text-ink' : 'border-edge bg-void/50 text-mute hover:text-ink'
            }`}
            style={on && o.color ? { borderColor: o.color, background: `color-mix(in srgb, ${o.color} 16%, transparent)` } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const STAT_ICONS: Record<StatKey, LucideIcon> = {
  str: Sword,
  vit: Heart,
  int: BookOpen,
  spi: Sparkles,
  foc: Target,
  for: Coins,
};

export function StatIcon({ stat, size = 16 }: { stat: StatKey; size?: number }) {
  const Icon = STAT_ICONS[stat];
  return <Icon size={size} style={{ color: statColor(stat) }} aria-hidden />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-center text-sm text-mute">{children}</p>;
}
