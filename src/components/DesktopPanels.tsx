import { Bell, BellOff, FolderOpen, History } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useFx } from '../data/fx';
import { formatLong } from '../game/dates';
import {
  getReminder,
  listBackups,
  openBackups,
  restoreBackup,
  setReminder,
  testReminder,
  type BackupInfo,
} from '../sync';
import { Button, Modal, inputBase } from './ui';

/*
 * Settings that only exist in the desktop window ("Isekai Habits.exe"), because the
 * window program does the work: the daily backups and the evening reminder.
 */

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;

/** The copies of the save the window program has put aside, and a way back to one of them. */
export function BackupList() {
  const toast = useFx((s) => s.toast);
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      listBackups().then(
        (list) => {
          setBackups(list);
          setError(null);
        },
        (err) => setError(messageOf(err)),
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const label = (b: BackupInfo) =>
    b.kind === 'daily' ? `Start of ${formatLong(b.date)}` : `Before a restore, ${formatLong(b.date)} at ${b.time}`;

  return (
    <div>
      <p className="mb-3 text-sm text-mute">
        A copy of your save is put aside on this PC the first time the app runs each day, and the last 14 are kept.
        Each one is your save as it was when that day began.
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {backups && backups.length === 0 && (
        <p className="mb-3 text-sm text-mute">No copies yet. The first one is made the next time the app starts with a save.</p>
      )}
      {backups && backups.length > 0 && (
        <ul className="mb-3 max-h-64 divide-y divide-edge/50 overflow-y-auto rounded-lg border border-edge/70">
          {backups.map((b) => (
            <li key={b.name} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <History size={15} className="shrink-0 text-mute" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                {label(b)} <span className="text-xs text-mute tabular-nums">· {kb(b.size)}</span>
              </span>
              <Button className="min-h-8" onClick={() => setConfirm(b)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" onClick={() => void openBackups().catch((err) => setError(messageOf(err)))}>
        <FolderOpen size={16} /> Open the backups folder
      </Button>

      {confirm && (
        <Modal title="Restore a backup" onClose={() => setConfirm(null)}>
          <p className="text-sm">
            This puts your save back to <strong>{label(confirm).replace(/^Start/, 'the start')}</strong>. Everything
            done since then is undone: habits ticked, gold spent, money entries, all of it.
          </p>
          <p className="mt-2 text-sm text-mute">
            Your save as it is now is kept in the list as “Before a restore”, so you can come back to it. If another
            device still has the newer progress, it brings it back the next time it syncs to the same file.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                restoreBackup(confirm.name)
                  .then(
                    () => toast('Backup restored', 'info'),
                    (err) => toast(messageOf(err), 'warn'),
                  )
                  .finally(() => {
                    setBusy(false);
                    setConfirm(null);
                    void load();
                  });
              }}
            >
              Restore
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** A notification from Windows in the evening, when habits are still open. */
export function ReminderPanel() {
  const toast = useFx((s) => s.toast);
  // null while it is being looked up; '' when off; else the time as HH:MM.
  const [time, setTime] = useState<string | null>(null);
  const [draft, setDraft] = useState('20:00');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getReminder().then(
      (t) => {
        setTime(t);
        if (t) setDraft(t);
      },
      () => setTime(''),
    );
  }, []);

  const change = (to: string) => {
    setBusy(true);
    setReminder(to)
      .then(
        (t) => {
          setTime(t);
          toast(t ? `Reminder set for ${t}` : 'Reminder turned off', 'info');
        },
        (err) => toast(messageOf(err), 'warn'),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <p className="mb-3 text-sm text-mute">
        Windows shows a notification at this time each day if habits are still open, even when the app is closed.
        Clicking it opens the app. On a day when everything is done, it stays quiet.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="time"
          className={`${inputBase} w-32`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Reminder time"
        />
        {time ? (
          <>
            <Button onClick={() => change(draft)} disabled={busy || !draft || draft === time}>
              Change time
            </Button>
            <Button variant="ghost" onClick={() => change('')} disabled={busy}>
              <BellOff size={16} /> Turn off
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => change(draft)} disabled={busy || time === null || !draft}>
            <Bell size={16} /> Turn on
          </Button>
        )}
        <Button variant="ghost" onClick={() => void testReminder().catch((err) => toast(messageOf(err), 'warn'))}>
          Show one now
        </Button>
      </div>
      <p className="mt-3 text-xs text-mute" role="status">
        {time === null
          ? 'Checking…'
          : time
            ? `On: every day at ${time}. It is a task in the Windows Task Scheduler named “Isekai Habits reminder”.`
            : 'Off. Turning it on adds a task to the Windows Task Scheduler; nothing keeps running in the background.'}
      </p>
    </div>
  );
}
