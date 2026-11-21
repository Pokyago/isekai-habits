import { Swords } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CLASSES, WEEKDAY_LABELS, statColor } from '../data/meta';
import { useGame } from '../data/store';
import { CARE_DAYS, MOODS, MOOD_ORDER, companion, companionLine, moodFor, type CareDay, type Companion, type Mood } from '../game/companion';
import { weekday } from '../game/dates';
import { outfitOf, type Outfit } from '../game/wardrobe';
import { useToday } from '../hooks';
import { Heroine } from './Heroine';
import { Button, Modal } from './ui';

export const MOOD_COLOR: Record<Mood, string> = {
  radiant: 'var(--color-gold)',
  cheerful: 'var(--stat-vit)',
  steady: 'var(--color-glow)',
  tired: 'var(--stat-foc)',
  exhausted: 'var(--color-danger)',
};

interface Shown extends Companion {
  line: string;
  color: string;
  /** The colour of the gem on her bow: the hero's class. */
  accent: string;
  /** What she has on. */
  outfit: Outfit;
  /** True for a moment after XP was earned: she jumps for joy. */
  cheering: boolean;
  label: string;
}

/** How long she celebrates something that was just done. */
const CHEER_MS = 1900;

/** Everything the heroine's pictures need. `xp` is the hero's total XP: when it rises, she cheers. */
function useCompanion(xp: number): Shown {
  const data = useGame((s) => s.data);
  const today = useToday();
  const c = useMemo(() => companion(data, today), [data, today]);

  const [cheering, setCheering] = useState(false);
  const before = useRef(xp);
  useEffect(() => {
    const rose = xp > before.current;
    before.current = xp;
    if (!rose) return;
    setCheering(true);
    const id = setTimeout(() => setCheering(false), CHEER_MS);
    return () => clearTimeout(id);
  }, [xp]);

  const line = companionLine(c);
  const outfit = useMemo(() => outfitOf(data), [data]);
  const stat = data.hero ? CLASSES[data.hero.heroClass].stat : 'spi';
  return {
    ...c,
    line,
    color: MOOD_COLOR[c.mood],
    accent: statColor(stat),
    outfit,
    cheering,
    label: `Your heroine is ${MOODS[c.mood].name.toLowerCase()}: morale ${c.morale} out of 100. She says: ${line} Open to see why.`,
  };
}

const frame = (color: string) => ({
  borderColor: `color-mix(in srgb, ${color} 45%, var(--color-edge))`,
  background: `radial-gradient(120% 90% at 50% 100%, color-mix(in srgb, ${color} 12%, transparent), transparent 70%), color-mix(in srgb, var(--color-void) 60%, transparent)`,
});

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-void/80 ring-1 ring-edge/60">
      <span
        className="block h-full rounded-full transition-[width,background-color] duration-700 ease-out"
        style={{ width: `${value}%`, background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </span>
  );
}

/**
 * The heroine's window in the side rail, on every screen of a large window.
 * It gives way first when the rail is short: she is drawn smaller.
 */
export function CompanionWindow({ xp, onToday }: { xp: number; onToday(): void }) {
  const c = useCompanion(xp);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={c.label}
        className="flex min-h-24 w-full shrink flex-col overflow-hidden rounded-xl border text-left transition-[border-color,filter] duration-700 hover:brightness-110"
        style={frame(c.color)}
      >
        <span className="block h-48 min-h-12 w-full shrink">
          <Heroine mood={c.mood} cheering={c.cheering} accent={c.accent} tone={c.color} outfit={c.outfit} className="size-full" />
        </span>
        <span className="block shrink-0 border-t border-edge/60 bg-panel/60 px-3 pt-2 pb-2.5">
          <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold transition-colors duration-700" style={{ color: c.color }}>
              {MOODS[c.mood].name}
            </span>
            <span className="text-[11px] text-mute tabular-nums">Morale {c.morale}</span>
          </span>
          <Meter value={c.morale} color={c.color} />
          {/* On a short window there is no room for what she says: it is in her details. */}
          <span className="mt-2 block min-h-[2.6em] text-[11px] leading-[1.3] text-mute [@media(max-height:720px)]:hidden">
            “{c.line}”
          </span>
        </span>
      </button>
      {open && <CompanionDetails c={c} onClose={() => setOpen(false)} onToday={onToday} />}
    </>
  );
}

/** The heroine's face in the top bar, where there is no side rail. Opens the same details. */
export function CompanionBadge({ xp, onToday }: { xp: number; onToday(): void }) {
  const c = useCompanion(xp);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={c.label}
        title={`${MOODS[c.mood].name}: “${c.line}”`}
        className={`size-9 shrink-0 overflow-hidden sm:size-11 rounded-full border-2 transition-[border-color] duration-700 lg:hidden ${c.cheering ? 'animate-goal' : ''}`}
        style={{ borderColor: c.color, background: `color-mix(in srgb, ${c.color} 14%, var(--color-void))` }}
      >
        <Heroine mood={c.mood} cheering={c.cheering} accent={c.accent} tone={c.color} outfit={c.outfit} portrait className="size-full" />
      </button>
      {open && <CompanionDetails c={c} onClose={() => setOpen(false)} onToday={onToday} />}
    </>
  );
}

/** Her up close, and why she feels the way she does. */
function CompanionDetails({ c, onClose, onToday }: { c: Shown; onClose(): void; onToday(): void }) {
  const left = c.today.due - c.today.done;
  // Drawn at the top of the page: the bars it is opened from are fixed in place, which would trap it.
  return createPortal(
    <Modal title="Your heroine" onClose={onClose}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="mx-auto h-56 w-44 shrink-0 overflow-hidden rounded-xl border" style={frame(c.color)}>
          <Heroine mood={c.mood} cheering={c.cheering} accent={c.accent} tone={c.color} outfit={c.outfit} className="size-full" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold" style={{ color: c.color }}>
              {MOODS[c.mood].name}
            </span>
            <span className="text-xs text-mute tabular-nums">Morale {c.morale} / 100</span>
          </div>
          <Meter value={c.morale} color={c.color} />
          <p className="mt-3 text-sm">“{c.line}”</p>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Her moods, best first">
            {MOOD_ORDER.map((m) => {
              const on = m === c.mood;
              return (
                <li
                  key={m}
                  aria-current={on ? 'true' : undefined}
                  className={`rounded-md border px-1.5 py-0.5 text-[11px] leading-tight ${on ? 'font-semibold' : 'border-edge/70 text-mute'}`}
                  style={on ? { color: MOOD_COLOR[m], borderColor: MOOD_COLOR[m] } : undefined}
                >
                  {MOODS[m].name}
                  {MOODS[m].from > 0 && <span className="opacity-70"> {MOODS[m].from}+</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <h3 className="mt-5 mb-2 text-[10px] font-semibold tracking-wide text-mute uppercase">The last {CARE_DAYS} days, and today</h3>
      <ol className="flex gap-1.5">
        {c.week.map((day) => (
          <DayColumn key={day.date} day={day} />
        ))}
        <DayColumn day={c.today} today />
      </ol>

      <p className="mt-4 text-xs leading-relaxed text-mute">
        She lives on your habits. Her morale is the share of habits you did over the last {CARE_DAYS} days, the recent
        days counting most: a missed day costs her about one mood, and a good day wins one back. Today only counts in
        her favour until it is over. Days with nothing to do, and habits you skipped on the Plan page, don’t count.
      </p>

      {left > 0 && (
        <Button
          variant="primary"
          className="mt-4 w-full"
          onClick={() => {
            onClose();
            onToday();
          }}
        >
          <Swords size={16} /> {left === 1 ? '1 habit left today' : `${left} habits left today`}
        </Button>
      )}
    </Modal>,
    document.body,
  );
}

export function DayColumn({ day, today = false, dim = false }: { day: CareDay; today?: boolean; dim?: boolean }) {
  const share = day.due > 0 ? day.done / day.due : 0;
  const color = MOOD_COLOR[moodFor(share * 100)];
  const name = WEEKDAY_LABELS[weekday(day.date)];
  return (
    <li
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border py-2 ${today ? 'border-glow/60 bg-glow/5' : 'border-edge/50'} ${dim ? 'opacity-40' : ''}`}
      aria-label={`${today ? 'Today' : name}: ${day.due === 0 ? 'nothing to do' : `${day.done} of ${day.due} habits done`}`}
    >
      <span className="relative block h-12 w-2.5 overflow-hidden rounded-full bg-void/80 ring-1 ring-edge/60" aria-hidden>
        {day.due > 0 && (
          <span
            className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500"
            style={{ height: `${Math.max(share * 100, day.done > 0 ? 12 : 0)}%`, background: color }}
          />
        )}
      </span>
      <span className={`text-[10px] leading-none ${today ? 'font-semibold text-glow' : 'text-mute'}`} aria-hidden>
        {today ? 'Today' : name}
      </span>
      <span className="text-[10px] leading-none tabular-nums" aria-hidden>
        {day.due === 0 ? '–' : `${day.done}/${day.due}`}
      </span>
    </li>
  );
}
