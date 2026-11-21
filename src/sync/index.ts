import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { mergeSaves, parseSave, sameSave, saveFingerprint, serializeSave } from '../data/merge';
import { useGame } from '../data/store';
import type { DateStr, SaveData } from '../data/types';
import { todayStr } from '../game/dates';
import { reminderBrief } from '../game/reminder';
import { callHost, hostBrief, isDesktop } from './desktop';

/*
 * Sync works on a single save file, meant to live in iCloud Drive. There are three ways
 * to reach it, depending on where the app runs:
 *
 * - 'desktop' (Isekai Habits.exe): the window program reads and writes the file. It is
 *   always connected; there is nothing to set up.
 * - 'auto' (Chrome/Edge on a PC): the browser keeps a handle to a file the user picked
 *   and this module reads, merges and writes it on its own.
 * - 'manual' (Safari on iPad, and anything else): the user picks the file to load it,
 *   and shares/downloads it to save it back.
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

/** The save file, however it is reached. */
interface SaveFile {
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

const hasPickers = typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

export type SyncMode = 'desktop' | 'auto' | 'manual';
export const syncMode: SyncMode = isDesktop ? 'desktop' : hasPickers ? 'auto' : 'manual';

export type SyncStatus = 'off' | 'needs-permission' | 'syncing' | 'synced' | 'error';

interface SyncState {
  status: SyncStatus;
  /** File name in a browser; full path in the desktop app. */
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

let file: SaveFile | null = null;
let handle: SaveFileHandle | null = null;
let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSyncedPrint: string | null = null;
let started = false;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function browserFile(h: SaveFileHandle): SaveFile {
  return {
    read: async () => (await h.getFile()).text(),
    async write(text) {
      const writable = await h.createWritable();
      await writable.write(text);
      await writable.close();
    },
  };
}

const desktopFile: SaveFile = {
  read: async () => (await callHost('read')).text ?? '',
  async write(text) {
    await callHost('write', text);
  },
};

async function hasPermission(h: SaveFileHandle, ask: boolean): Promise<boolean> {
  const options = { mode: 'readwrite' } as const;
  if ((await h.queryPermission(options)) === 'granted') return true;
  return ask ? (await h.requestPermission(options)) === 'granted' : false;
}

/** Read the file, merge it with this device, and write back whichever side is behind. */
async function runSync(): Promise<void> {
  if (!file) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  useSync.setState({ status: 'syncing', error: null });
  try {
    // If the file can't be read as a save this throws, and the file is left untouched.
    const fileData = parseSave(await file.read());
    const local = useGame.getState().data;
    const merged = mergeSaves(local, fileData);

    lastSyncedPrint = saveFingerprint(merged);
    if (!sameSave(merged, local)) useGame.getState().replaceData(merged);
    if (!sameSave(merged, fileData)) await file.write(serializeSave(merged));
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
  if (file && status !== 'needs-permission' && status !== 'off') void runSync();
}

function scheduleSync(data: SaveData): void {
  if (!file || saveFingerprint(data) === lastSyncedPrint) return;
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

  try {
    if (syncMode === 'desktop') {
      const info = await callHost('info');
      file = desktopFile;
      useSync.setState({ fileName: info.path ?? SAVE_FILE_NAME, status: 'syncing' });
      // The window program calls this just before it closes, so the last change reaches the file.
      (window as unknown as { isekaiFlush?: () => void }).isekaiFlush = () => {
        clearTimeout(timer);
        clearTimeout(briefTimer);
        postBrief();
        void runSync();
      };
      await runSync();
      startBriefs();
    } else if (syncMode === 'auto') {
      handle = (await idbGet<SaveFileHandle>(HANDLE_KEY)) ?? null;
      if (!handle) return;
      file = browserFile(handle);
      useSync.setState({ fileName: handle.name });
      if (await hasPermission(handle, false)) await runSync();
      else useSync.setState({ status: 'needs-permission' });
    }
  } catch (err) {
    useSync.setState({ status: 'error', error: messageOf(err) });
  }
}

/** Browser only. Ask the user for the save file: a new one to create, or an existing one to join. */
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
  file = browserFile(picked);
  await idbSet(HANDLE_KEY, picked);
  useSync.setState({ fileName: picked.name, status: 'syncing' });
  await runSync();
}

/** Browser only. Browsers forget file permission between visits; this asks again (needs a click). */
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

/** Browser only. */
export async function disconnectSaveFile(): Promise<void> {
  handle = null;
  file = null;
  lastSyncedPrint = null;
  clearTimeout(timer);
  await idbDel(HANDLE_KEY);
  useSync.setState({ status: 'off', fileName: null, lastSyncedAt: null, error: null });
}

/** Desktop only. Let the user move the save file somewhere else, or point at an existing one. */
export async function chooseSaveLocation(): Promise<void> {
  try {
    const reply = await callHost('choose');
    if (!reply.changed) return;
    lastSyncedPrint = null;
    useSync.setState({ fileName: reply.path ?? SAVE_FILE_NAME });
    await runSync();
  } catch (err) {
    useSync.setState({ status: 'error', error: messageOf(err) });
  }
}

/** Desktop only. Show the save file in File Explorer. */
export function revealSaveFile(): void {
  void callHost('reveal').catch(() => undefined);
}

/**
 * Desktop only, for "erase everything": sets the save file aside under another name so
 * the erased game isn't merged straight back in. Returns the new name, or null if
 * there was no file. Reset the game right after this resolves.
 */
export async function retireSaveFile(): Promise<string | null> {
  clearTimeout(timer);
  queued = false;
  while (running) await sleep(40);
  const reply = await callHost('retire');
  lastSyncedPrint = null;
  return reply.text ?? null;
}

// ---------- desktop only: backups ----------

/** A copy of the save that the window program has put aside. */
export interface BackupInfo {
  name: string;
  size: number;
  /** 'daily': the save as a day began. 'before-restore': the save as it was just before a backup was restored. */
  kind: 'daily' | 'before-restore';
  date: DateStr;
  /** HH:MM, for a 'before-restore' copy. */
  time: string | null;
}

/** Newest first. */
export async function listBackups(): Promise<BackupInfo[]> {
  const reply = await callHost('backups');
  const files = JSON.parse(reply.text ?? '[]') as { name: string; size: number }[];
  const list: BackupInfo[] = [];
  for (const f of files) {
    const daily = /^isekai-habits-(\d{4}-\d{2}-\d{2})\.json$/.exec(f.name);
    const before = /^before-restore-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\d{2}\.json$/.exec(f.name);
    if (daily) list.push({ ...f, kind: 'daily', date: daily[1], time: null });
    else if (before) list.push({ ...f, kind: 'before-restore', date: before[1], time: `${before[2]}:${before[3]}` });
  }
  const key = (b: BackupInfo) => `${b.date} ${b.time ?? '00:00'} ${b.name}`;
  return list.sort((a, b) => (key(a) < key(b) ? 1 : -1));
}

/**
 * Puts the save back to one of the copies. Unlike every other read this is not a merge:
 * the copy replaces what is on this device and in the save file.
 */
export async function restoreBackup(name: string): Promise<void> {
  clearTimeout(timer);
  queued = false;
  while (running) await sleep(40);
  running = true;
  try {
    const reply = await callHost('restore', name);
    const data = parseSave(reply.text ?? '');
    lastSyncedPrint = saveFingerprint(data);
    useGame.getState().replaceData(data);
    useSync.setState({ status: 'synced', lastSyncedAt: Date.now(), error: null });
  } finally {
    running = false;
  }
}

export async function openBackups(): Promise<void> {
  await callHost('openBackups');
}

// ---------- desktop only: the evening reminder ----------

/** The time the reminder is set for, as HH:MM, or '' when it is off. */
export async function getReminder(): Promise<string> {
  return (await callHost('reminder')).text ?? '';
}

/** Sets the reminder to a time (HH:MM), or turns it off with ''. Returns what it is now. */
export async function setReminder(time: string): Promise<string> {
  postBrief();
  return (await callHost('setReminder', time)).text ?? '';
}

export async function testReminder(): Promise<void> {
  postBrief();
  await callHost('testReminder');
}

let lastBrief = '';
let briefTimer: ReturnType<typeof setTimeout> | undefined;

/** Writes down, for the window program, what the reminder should say on the coming days. */
function postBrief(): void {
  const text = JSON.stringify(reminderBrief(useGame.getState().data, todayStr()));
  if (text === lastBrief) return;
  lastBrief = text;
  hostBrief(text);
}

function startBriefs(): void {
  postBrief();
  useGame.subscribe((state, prev) => {
    if (state.data === prev.data) return;
    clearTimeout(briefTimer);
    briefTimer = setTimeout(postBrief, 1500);
  });
  // The notes are dated: write new ones when the day changes with the app left open.
  setInterval(postBrief, 10 * 60_000);
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
export async function importSaveFile(picked: File): Promise<void> {
  const fileData = parseSave(await picked.text());
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
  const shareable = new File([text], SAVE_FILE_NAME, { type: 'application/json' });

  if (syncMode === 'manual' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [shareable] })) {
    try {
      await navigator.share({ files: [shareable] });
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
