import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_LABELS } from '../data/meta';
import type { DateStr } from '../data/types';
import { addDays, parseDate, todayStr, weekday } from '../game/dates';
import { addMonths, dayInMonth } from '../money/format';
import { inputBase } from './ui';

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'long' }));
const WIDTH = 296;

/** "Sat, Nov 21, 2026": the day of the week is there to catch an off-by-one at a glance. */
const pretty = (date: DateStr) =>
  parseDate(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A date, picked from a calendar. It looks like the other text boxes; clicking it opens
 * a month to pick a day from, with the month and year changeable at the top. The value
 * is a date as YYYY-MM-DD, or '' when empty.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  clearable = false,
  disabled = false,
  label,
  placeholder = 'Pick a date',
  className = 'w-full',
}: {
  value: string;
  onChange(value: string): void;
  /** The earliest and latest days that can be picked. */
  min?: DateStr;
  max?: DateStr;
  /** Shows a button that empties the field, for dates that are optional. */
  clearable?: boolean;
  disabled?: boolean;
  /** What the date is, for screen readers, when there is no visible label around it. */
  label?: string;
  placeholder?: string;
  /** The width: w-full unless told otherwise. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const shown = isDate(value) ? pretty(value) : placeholder;
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label}: ${shown}` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${inputBase} flex items-center gap-2 text-left disabled:opacity-50 ${open ? 'border-glow' : ''} ${className}`}
      >
        <CalendarDays size={16} className="shrink-0 text-mute" aria-hidden />
        <span className={`min-w-0 flex-1 truncate ${isDate(value) ? '' : 'text-mute/60'}`}>{shown}</span>
      </button>
      {open && (
        <Calendar
          anchor={trigger}
          value={isDate(value) ? value : ''}
          min={min}
          max={max}
          clearable={clearable}
          onPick={(date) => {
            onChange(date);
            close();
          }}
          onClose={close}
        />
      )}
    </>
  );
}

function Calendar({
  anchor,
  value,
  min,
  max,
  clearable,
  onPick,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  value: string;
  min?: DateStr;
  max?: DateStr;
  clearable: boolean;
  onPick(date: string): void;
  onClose(): void;
}) {
  const today = todayStr();
  const inRange = useCallback((date: DateStr) => (!min || date >= min) && (!max || date <= max), [min, max]);
  const clamp = useCallback((date: DateStr) => (min && date < min ? min : max && date > max ? max : date), [min, max]);

  // The day the keyboard is on; the month shown is the one it is in.
  const [cursor, setCursor] = useState<DateStr>(() => clamp(value || today));
  const month = cursor.slice(0, 7);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  // Moving by keyboard (and opening) puts the focus on the day; picking a month from the list leaves it there.
  const followDay = useRef(true);

  // Under the field, or above it when there is no room below. Drawn at the top of the page so a dialog can't cut it off.
  useLayoutEffect(() => {
    const put = () => {
      const from = anchor.current?.getBoundingClientRect();
      if (!from) return;
      const height = box.current?.offsetHeight ?? 360;
      const left = Math.max(8, Math.min(from.left, window.innerWidth - WIDTH - 8));
      const below = from.bottom + 6;
      const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, from.top - height - 6);
      setPlace({ left, top });
    };
    put();
    window.addEventListener('resize', put);
    window.addEventListener('scroll', put, true);
    return () => {
      window.removeEventListener('resize', put);
      window.removeEventListener('scroll', put, true);
    };
  }, [anchor]);

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const at = e.target as Node;
      if (!box.current?.contains(at) && !anchor.current?.contains(at)) onClose();
    };
    // Caught before anything else, so Escape closes the calendar and not the dialog it is in.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape, true);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    if (!place || !followDay.current) return;
    box.current?.querySelector<HTMLButtonElement>('[data-cursor]')?.focus();
  }, [cursor, place]);

  const move = (to: DateStr) => {
    followDay.current = true;
    setCursor(clamp(to));
  };
  const toMonth = (m: string, keyboard = false) => {
    followDay.current = keyboard;
    setCursor(clamp(dayInMonth(m, Number(cursor.slice(8)))));
  };

  // Six weeks, Monday first, starting in the month before when the 1st isn't a Monday.
  const first = `${month}-01`;
  const gridStart = addDays(first, -((weekday(first) + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const year = Number(month.slice(0, 4));
  const thisYear = Number(today.slice(0, 4));
  const firstYear = Math.min(year, min ? Number(min.slice(0, 4)) : thisYear - 10);
  const lastYear = Math.max(year, max ? Number(max.slice(0, 4)) : thisYear + 10);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
  const canGo = (m: string) => (!min || dayInMonth(m, 31) >= min) && (!max || `${m}-01` <= max);
  const pick = 'min-h-8 rounded-md border border-edge bg-void/70 px-1.5 text-sm text-ink focus:border-glow focus:outline-none';
  const arrow =
    'flex size-8 shrink-0 items-center justify-center rounded-md text-mute transition-colors hover:bg-raise hover:text-ink disabled:opacity-30';

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label="Choose a date"
      className="fixed z-50 rounded-xl border border-edge bg-panel p-3 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
      style={{ width: WIDTH, left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? 'visible' : 'hidden' }}
    >
      <div className="mb-2 flex items-center gap-1">
        <button type="button" className={arrow} aria-label="The month before" disabled={!canGo(addMonths(month, -1))} onClick={() => toMonth(addMonths(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <select
          className={`${pick} min-w-0 flex-1`}
          aria-label="Month"
          value={Number(month.slice(5)) - 1}
          onChange={(e) => toMonth(`${month.slice(0, 4)}-${String(Number(e.target.value) + 1).padStart(2, '0')}`)}
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <select className={pick} aria-label="Year" value={year} onChange={(e) => toMonth(`${e.target.value}-${month.slice(5)}`)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="button" className={arrow} aria-label="The month after" disabled={!canGo(addMonths(month, 1))} onClick={() => toMonth(addMonths(month, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div
        role="grid"
        aria-label={`${MONTHS[Number(month.slice(5)) - 1]} ${year}`}
        onKeyDown={(e) => {
          const step: Record<string, DateStr | undefined> = {
            ArrowLeft: addDays(cursor, -1),
            ArrowRight: addDays(cursor, 1),
            ArrowUp: addDays(cursor, -7),
            ArrowDown: addDays(cursor, 7),
            Home: addDays(cursor, -((weekday(cursor) + 6) % 7)),
            End: addDays(cursor, 6 - ((weekday(cursor) + 6) % 7)),
          };
          if (e.key === 'PageUp' || e.key === 'PageDown') {
            e.preventDefault();
            toMonth(addMonths(month, e.key === 'PageUp' ? -1 : 1), true);
          } else if (step[e.key]) {
            e.preventDefault();
            move(step[e.key]!);
          }
        }}
      >
        <div role="row" className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold tracking-wide text-mute uppercase">
          {WEEKDAY_DISPLAY_ORDER.map((d) => (
            <span key={d} role="columnheader">
              {WEEKDAY_LABELS[d].slice(0, 2)}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, w) => (
          <div key={w} role="row" className="grid grid-cols-7">
            {days.slice(w * 7, w * 7 + 7).map((date) => {
              const here = date.slice(0, 7) === month;
              const chosen = date === value;
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  data-cursor={date === cursor ? '' : undefined}
                  tabIndex={date === cursor ? 0 : -1}
                  disabled={!inRange(date)}
                  aria-selected={chosen}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={pretty(date)}
                  onClick={() => onPick(date)}
                  className={`m-0.5 flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors disabled:opacity-25 ${
                    chosen
                      ? 'bg-glow font-bold text-void'
                      : isToday
                        ? 'font-semibold text-gold ring-1 ring-gold/70 ring-inset hover:bg-raise'
                        : here
                          ? 'hover:bg-raise'
                          : 'text-mute/50 hover:bg-raise'
                  }`}
                >
                  {Number(date.slice(8))}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-edge/60 pt-2">
        <button
          type="button"
          className="min-h-8 rounded-md px-2 text-sm font-medium text-glow transition-colors hover:bg-raise disabled:opacity-30"
          disabled={!inRange(today)}
          onClick={() => onPick(today)}
        >
          Today
        </button>
        {clearable && value !== '' && (
          <button type="button" className="min-h-8 rounded-md px-2 text-sm text-mute transition-colors hover:bg-raise hover:text-ink" onClick={() => onPick('')}>
            No date
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
