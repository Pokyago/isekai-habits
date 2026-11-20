import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { mergeSaves, parseSave, sameSave, saveFingerprint, serializeSave } from '../data/merge';
import { useGame } from '../data/store';
import type { SaveData } from '../data/types';

/*
 * Sync works on a single save file, meant to live in iCloud Drive.
 *
 * - Automatic (Chrome/Edge on a PC): the browser keeps a handle to the file and
 *   this module reads, merges and writes it on its own.
 * - Manual (Safari on iPad, and anything else): the user picks the file to load
 *   it, and shares/downloads it to save it back.
 *
 * Every read is a merge, so a stale file or an iCloud conflict copy never loses data.
 */

export const SAVE_FILE_NAME = 'isekai-habits-save.json';
const HANDLE_KEY = 'isekai-habits-sync-handle';
const MANUAL_KEY = 'isekai-habits-manual-synced';

interface SaveFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface PickerWindow {
  showSaveFilePicker?(options: unknown): Promise<SaveFileHandle>;
  showOpenFilePicker?(options: unknown): Promise<SaveFileHandle[]>;
}

/** True where the browser can keep writing to a chosen file by itself. */
export const canAutoSync =
  typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

export type SyncStatus = 'off' | 'needs-permission' | 'syncing' | 'synced' | 'error';

interface SyncState {
  status: SyncStatus;
  fileName: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  /** Fingerprint of the save as it was last loaded from or saved to a file by hand. */
  manualPrint: string | null;
}

export const useSync = create<SyncState>(() => ({
  status: 'off',
  fileName: null,
  lastSyncedAt: null,
  error: null,
  manualPrint: null,
}));

let handle: SaveFileHandle | null = null;
let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSyncedPrint: string | null = null;
let started = false;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

async function hasPermission(h: SaveFileHandle, ask: boolean): Promise<boolean> {
  const options = { mode: 'readwrite' } as const;
  if ((await h.queryPermission(options)) === 'granted') return true;
  return ask ? (await h.requestPermission(options)) === 'granted' : false;
}

/** Read the file, merge it with this device, and write back whichever side is behind. */
async function runSync(): Promise<void> {
  if (!handle) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  useSync.setState({ status: 'syncing', error: null });
  try {
    const file = await handle.getFile();
    // If the file can't be read as a save this throws, and the file is left untouched.
    const fileData = parseSave(await file.text());
    const local = useGame.getState().data;
    const merged = mergeSaves(local, fileData);

    lastSyncedPrint = saveFingerprint(merged);
    if (!sameSave(merged, local)) useGame.getState().replaceData(merged);
    if (!sameSave(merged, fileData)) {
      const writable = await handle.createWritable();
      await writable.write(serializeSave(merged));
      await writable.close();
    }
    useSync.setState({ status: 'synced', lastSyncedAt: Date.now() });
  } catch (err) {
    lastSyncedPrint = null;
    const lostPermission = err instanceof DOMException && err.name === 'NotAllowedError';
    useSync.setState(
      lostPermission ? { status: 'needs-permission' } : { status: 'error', error: messageOf(err) },
    );
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void runSync();
    }
  }
}

function syncIfReady(): void {
  const { status } = useSync.getState();
  if (handle && status !== 'needs-permission' && status !== 'off') void runSync();
}

function scheduleSync(data: SaveData): void {
  if (!handle || saveFingerprint(data) === lastSyncedPrint) return;
  clearTimeout(timer);
  timer = setTimeout(syncIfReady, 1200);
}

/** Call once after the game has loaded. */
export async function initSync(): Promise<void> {
  if (started) return;
  started = true;

  try {
    useSync.setState({ manualPrint: localStorage.getItem(MANUAL_KEY) });
  } catch {
    // Storage can be unavailable in private windows; manual sync just shows as "not saved yet".
  }

  useGame.subscribe((state, prev) => {
    if (state.data !== prev.data) scheduleSync(state.data);
  });
  window.addEventListener('focus', syncIfReady);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncIfReady();
  });

  if (!canAutoSync) return;
  try {
    handle = (await idbGet<SaveFileHandle>(HANDLE_KEY)) ?? null;
    if (!handle) return;
    useSync.setState({ fileName: handle.name });
    if (await hasPermission(handle, false)) await runSync();
    else useSync.setState({ status: 'needs-permission' });
  } catch (err) {
    useSync.setState({ status: 'error', error: messageOf(err) });
  }
}

/** Ask the user for the save file: a new one to create, or an existing one to join. */
export async function connectSaveFile(kind: 'new' | 'existing'): Promise<void> {
  const w = window as unknown as PickerWindow;
  const types = [{ description: 'Isekai Habits save', accept: { 'application/json': ['.json'] } }];
  let picked: SaveFileHandle;
  try {
    picked =
      kind === 'new'
        ? await w.showSaveFilePicker!({ suggestedName: SAVE_FILE_NAME, types })
        : (await w.showOpenFilePicker!({ types, multiple: false }))[0];
  } catch (err) {
    if (isAbort(err)) return;
    useSync.setState({ status: 'error', error: messageOf(err) });
    return;
  }
  if (!(await hasPermission(picked, true))) {
    useSync.setState({ status: 'error', error: 'Permission to edit the save file was not granted.' });
    return;
  }
  handle = picked;
  await idbSet(HANDLE_KEY, picked);
  useSync.setState({ fileName: picked.name, status: 'syncing' });
  await runSync();
}

/** Browsers forget file permission between visits; this asks again (needs a click). */
export async function reconnectSaveFile(): Promise<void> {
  if (!handle) return;
  try {
    if (await hasPermission(handle, true)) await runSync();
  } catch (err) {
    useSync.setState({ status: 'error', error: messageOf(err) });
  }
}

export async function syncNow(): Promise<void> {
  await runSync();
}

export async function disconnectSaveFile(): Promise<void> {
  handle = null;
  lastSyncedPrint = null;
  clearTimeout(timer);
  await idbDel(HANDLE_KEY);
  useSync.setState({ status: 'off', fileName: null, lastSyncedAt: null, error: null });
}

function markManualSynced(data: SaveData): void {
  const print = saveFingerprint(data);
  try {
    localStorage.setItem(MANUAL_KEY, print);
  } catch {
    // See initSync.
  }
  useSync.setState({ manualPrint: print });
}

/** Manual sync, step 1: merge a chosen save file into this device. */
export async function importSaveFile(file: File): Promise<void> {
  const fileData = parseSave(await file.text());
  const local = useGame.getState().data;
  const merged = mergeSaves(local, fileData);
  if (!sameSave(merged, local)) useGame.getState().replaceData(merged);
  // If the file already had everything, there is nothing to save back.
  if (sameSave(merged, fileData)) markManualSynced(merged);
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Manual sync, step 2: hand the save file to the system so it can be stored in
 * iCloud Drive. On iPad this opens the share sheet ("Save to Files"); elsewhere it downloads.
 */
export async function exportSaveFile(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data = useGame.getState().data;
  const text = serializeSave(data);
  const file = new File([text], SAVE_FILE_NAME, { type: 'application/json' });

  if (!canAutoSync && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      markManualSynced(data);
      return 'shared';
    } catch (err) {
      if (isAbort(err)) return 'cancelled';
      // Fall through to a plain download.
    }
  }
  download(text, SAVE_FILE_NAME);
  markManualSynced(data);
  return 'downloaded';
}

/** A dated copy for safekeeping; doesn't affect sync. */
export function downloadBackup(date: string): void {
  download(serializeSave(useGame.getState().data), `isekai-habits-backup-${date}.json`);
}
