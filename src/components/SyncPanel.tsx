import { FilePlus, FolderOpen, RefreshCw, Share, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useFx } from '../data/fx';
import { saveFingerprint } from '../data/merge';
import { useGame } from '../data/store';
import {
  canAutoSync,
  connectSaveFile,
  disconnectSaveFile,
  exportSaveFile,
  importSaveFile,
  reconnectSaveFile,
  syncNow,
  useSync,
} from '../sync';
import { Button } from './ui';

/** True when this device has changes that haven't been saved back to the file by hand. */
export function useManualDirty(): boolean {
  const data = useGame((s) => s.data);
  const manualPrint = useSync((s) => s.manualPrint);
  const print = useMemo(() => saveFingerprint(data), [data]);
  return data.hero !== null && print !== manualPrint;
}

function AutoSync() {
  const { status, fileName, lastSyncedAt, error } = useSync();

  if (status === 'off') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-mute">
          Keep your progress in a save file inside your <strong className="text-ink">iCloud Drive</strong> folder. This
          PC will then read and update it automatically, and your iPad can load the same file.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void connectSaveFile('new')}>
            <FilePlus size={16} /> Create a save file
          </Button>
          <Button onClick={() => void connectSaveFile('existing')}>
            <FolderOpen size={16} /> Use an existing save file
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="text-mute">Save file: </span>
        <strong className="break-all">{fileName}</strong>
      </p>
      {status === 'needs-permission' && (
        <p className="text-sm text-gold">
          The browser needs your permission again to use the save file. Until you reconnect, changes stay on this
          device only.
        </p>
      )}
      {status === 'error' && <p className="text-sm text-danger">Sync failed: {error}</p>}
      {status === 'synced' && lastSyncedAt && (
        <p className="text-sm text-mute">
          Up to date · last synced {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {status === 'syncing' && <p className="text-sm text-mute">Syncing…</p>}
      <div className="flex flex-wrap gap-2">
        {status === 'needs-permission' ? (
          <Button variant="gold" onClick={() => void reconnectSaveFile()}>
            <RefreshCw size={16} /> Reconnect
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void syncNow()} disabled={status === 'syncing'}>
            <RefreshCw size={16} /> Sync now
          </Button>
        )}
        <Button variant="ghost" onClick={() => void disconnectSaveFile()}>
          Stop syncing
        </Button>
      </div>
    </div>
  );
}

function ManualSync() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const hasHero = useGame((s) => s.data.hero !== null);
  const dirty = useManualDirty();
  const toast = useFx((s) => s.toast);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await importSaveFile(file);
      toast('Save file loaded', 'info');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onExport = async () => {
    const result = await exportSaveFile();
    if (result === 'downloaded') toast('Save file downloaded', 'info');
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">
        This browser can’t update a file on its own, so syncing here takes two taps. Do both whenever you switch
        devices:
      </p>
      <ol className="space-y-3 text-sm">
        <li className="flex flex-wrap items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-glow/15 text-xs font-bold text-glow">
            1
          </span>
          <span className="min-w-40 flex-1">
            Load <strong>isekai-habits-save.json</strong> from iCloud Drive. Your progress here is merged with it.
          </span>
          <Button variant="primary" onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> Load save file
          </Button>
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-glow/15 text-xs font-bold text-glow">
            2
          </span>
          <span className="min-w-40 flex-1">
            Save it back: choose <strong>Save to Files</strong>, pick the same iCloud Drive folder and replace the old
            file.
          </span>
          <Button variant={dirty ? 'gold' : 'default'} onClick={() => void onExport()} disabled={!hasHero}>
            <Share size={16} /> Save back
          </Button>
        </li>
      </ol>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {hasHero && (
        <p className={`text-sm ${dirty ? 'text-gold' : 'text-mute'}`}>
          {dirty ? 'You have changes that aren’t in the save file yet.' : 'Everything here is in the save file.'}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function SyncPanel() {
  return canAutoSync ? <AutoSync /> : <ManualSync />;
}
