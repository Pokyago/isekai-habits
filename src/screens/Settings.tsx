import { Download } from 'lucide-react';
import { useState } from 'react';
import { SyncPanel } from '../components/SyncPanel';
import { Button, Modal, Panel, inputClass } from '../components/ui';
import { useFx } from '../data/fx';
import { SHIELD_COST } from '../data/meta';
import { useGame } from '../data/store';
import { useToday } from '../hooks';
import { disconnectSaveFile, downloadBackup, retireSaveFile, syncMode } from '../sync';

export function Settings() {
  const hero = useGame((s) => s.data.hero);
  const renameHero = useGame((s) => s.renameHero);
  const resetAll = useGame((s) => s.resetAll);
  const toast = useFx((s) => s.toast);
  const today = useToday();
  const [name, setName] = useState(hero?.name ?? '');
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Settings</h1>

      <Panel title={syncMode === 'desktop' ? 'Save file' : 'Sync with iCloud Drive'}>
        <SyncPanel />
      </Panel>

      <Panel title="Backup">
        <p className="mb-3 text-sm text-mute">
          Download a dated copy of your save for safekeeping.
          {syncMode !== 'desktop' && ' To restore one, load it as a save file; it is merged with what you have.'}
        </p>
        <Button onClick={() => downloadBackup(today)}>
          <Download size={16} /> Download backup
        </Button>
      </Panel>

      <Panel title="Hero name">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            renameHero(name);
          }}
        >
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Hero name"
            maxLength={30}
          />
          <Button type="submit" disabled={!name.trim() || name.trim() === hero?.name}>
            Rename
          </Button>
        </form>
      </Panel>

      <Panel title="How the game works">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-mute">
          <li>Completing a habit gives XP to your hero and to the habit’s stat, plus gold worth half the XP.</li>
          <li>Trivial, Easy, Medium and Hard habits are worth 5, 10, 20 and 40 XP.</li>
          <li>Streaks add a bonus that grows to +50% XP at 30 in a row. Your class adds 10% on its own stat.</li>
          <li>Missing a scheduled day resets that habit’s streak. Nothing else is lost.</li>
          <li>A streak shield ({SHIELD_COST} gold) is spent automatically to cover one missed day.</li>
          <li>Guild rank rises with level: E at 5, D at 10, C at 15, B at 20, A at 30, S at 40.</li>
        </ul>
      </Panel>

      <Panel title="Danger zone">
        <p className="mb-3 text-sm text-mute">Erase the hero and all progress on this device and start again.</p>
        <Button variant="danger" onClick={() => setConfirmReset(true)}>
          Erase everything on this device
        </Button>
      </Panel>

      {confirmReset && (
        <Modal title="Erase everything" onClose={() => setConfirmReset(false)}>
          {syncMode === 'desktop' ? (
            <>
              <p className="text-sm">
                This erases your hero, habits and history from <strong>this PC</strong> and starts a new game.
              </p>
              <p className="mt-2 text-sm text-mute">
                Your save file is not deleted: it is renamed (with “erased” and today’s date in its name) and left in
                the same folder, so you can go back to it. Another device that still has the old game will bring it
                back the next time it syncs to the same file.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                This erases your hero, habits and history from <strong>this device</strong> and stops syncing. It can’t
                be undone here.
              </p>
              <p className="mt-2 text-sm text-mute">
                Your iCloud Drive save file is not touched. If you load it again, your progress comes back; delete that
                file yourself if you want a completely fresh start.
              </p>
            </>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const detach = syncMode === 'desktop' ? retireSaveFile() : disconnectSaveFile();
                void detach.then(resetAll, (err) => toast(err instanceof Error ? err.message : String(err), 'warn'));
                setConfirmReset(false);
              }}
            >
              Erase
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
