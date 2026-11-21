import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from './data/store';
import type { DateStr } from './data/types';
import { dailyQuests, type DailyQuest } from './game/dailyQuests';
import { todayStr } from './game/dates';
import { derive, type Derived } from './game/derive';
import { dueHabits, isDone } from './game/schedule';

/** Today's date, kept current if the app is left open past midnight. */
export function useToday(): DateStr {
  const [today, setToday] = useState(todayStr);
  useEffect(() => {
    const tick = () => setToday(todayStr());
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

export function useDerived(): Derived {
  const data = useGame((s) => s.data);
  const today = useToday();
  return useMemo(() => derive(data, today), [data, today]);
}

export interface DayProgress {
  /** Habits scheduled for the day, and how many are done. */
  total: number;
  done: number;
  quests: DailyQuest[];
  /** XP earned on that day from habits, quests and other rewards. */
  xp: number;
}

/** How a day is going. Without a date, it is today. */
export function useDayProgress(date?: DateStr): DayProgress {
  const data = useGame((s) => s.data);
  const today = useToday();
  const day = date ?? today;
  return useMemo(() => {
    const scheduled = dueHabits(data, day).filter((h) => h.schedule.kind === 'weekdays');
    let xp = 0;
    for (const c of Object.values(data.completions)) if (c.date === day && c.done) xp += c.xp;
    for (const c of Object.values(data.claims)) if (c.date === day && c.claimed) xp += c.xp;
    for (const q of Object.values(data.quests)) if (q.doneDate === day) xp += q.xp;
    for (const p of Object.values(data.plan)) if (p.date === day && p.done) xp += p.xp;
    for (const m of Object.values(data.meals)) if (m.date === day && m.done) xp += m.xp;
    return {
      total: scheduled.length,
      done: scheduled.filter((h) => isDone(data, h.id, day)).length,
      quests: dailyQuests(data, day),
      xp,
    };
  }, [data, day]);
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up (or down) to its new value instead of jumping. */
export function useCountUp(value: number, ms = 500): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / ms);
      const eased = 1 - (1 - t) ** 3;
      const current = Math.round(start + (value - start) * eased);
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // If the page isn't being drawn (a background tab), frames never come: land on the value anyway.
    const fallback = setTimeout(() => {
      from.current = value;
      setShown(value);
    }, ms + 200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [value, ms]);
  return shown;
}

/** True once, briefly, each time `value` changes after the first render. Used to replay an animation. */
export function useChanged(value: unknown): number {
  const [count, setCount] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setCount((n) => n + 1);
    }
  }, [value]);
  return count;
}
