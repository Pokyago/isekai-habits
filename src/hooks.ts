import { useEffect, useMemo, useState } from 'react';
import { useGame } from './data/store';
import type { DateStr } from './data/types';
import { todayStr } from './game/dates';
import { derive, type Derived } from './game/derive';

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
