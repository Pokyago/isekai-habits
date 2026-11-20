import { Moon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGame } from '../data/store';
import { SLEEP_REWARD, averageSleep, formatSleep, parseSleep, sleepInputText, sleepLogs } from '../health/health';
import { useToday } from '../hooks';
import { Button, Panel, inputClass } from './ui';

/** A one-line way to log last night's sleep from the Today screen. The full log is on the Health page. */
export function SleepQuick() {
  const data = useGame((s) => s.data);
  const saveSleep = useGame((s) => s.saveSleep);
  const today = useToday();
  const nights = useMemo(() => sleepLogs(data), [data]);
  const logged = nights.find((n) => n.date === today);
  const average = averageSleep(nights, today);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const hours = parseSleep(text);
  const showForm = !logged || editing;

  return (
    <Panel>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-edge text-[var(--stat-spi)]">
          <Moon size={18} />
        </span>
        {showForm ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (hours === null) return;
              saveSleep(today, hours);
              setEditing(false);
              setText('');
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs text-mute">
                Last night’s sleep{!logged && ` · +${SLEEP_REWARD.xp} XP`}
              </span>
              <input
                className={`${inputClass} ${text.trim() !== '' && hours === null ? 'border-danger' : ''}`}
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. 7:30"
                aria-label="Hours slept last night"
                autoFocus={editing}
              />
            </label>
            <Button variant="primary" type="submit" className="self-end" disabled={hours === null}>
              {logged ? 'Save' : 'Log'}
            </Button>
          </form>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                Slept <strong>{formatSleep(logged.hours)}</strong> last night
              </p>
              {average !== null && <p className="text-xs text-mute">7-night average {formatSleep(average)}</p>}
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setText(sleepInputText(logged.hours));
                setEditing(true);
              }}
            >
              Change
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
