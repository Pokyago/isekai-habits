/*
 * Talks to the desktop window program (desktop/Program.cs) when the app runs inside
 * "Isekai Habits.exe". The program reads and writes the save file for the page, so
 * no file picker or browser permission is involved.
 */

interface WebViewHost {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface HostReply {
  id: number;
  ok: boolean;
  /** Full path of the save file. */
  path?: string;
  text?: string | null;
  changed?: boolean;
  error?: string;
}

export type HostCommand =
  | 'info'
  | 'read'
  | 'write'
  | 'choose'
  | 'reveal'
  | 'retire'
  | 'backups'
  | 'restore'
  | 'openBackups'
  | 'reminder'
  | 'setReminder'
  | 'testReminder';

const host: WebViewHost | undefined =
  typeof window === 'undefined'
    ? undefined
    : (window as unknown as { chrome?: { webview?: WebViewHost } }).chrome?.webview;

/** True when running inside the desktop window rather than a normal browser. */
export const isDesktop = host !== undefined;

let nextId = 1;
const pending = new Map<number, { resolve(reply: HostReply): void; reject(err: Error): void }>();

host?.addEventListener('message', (event) => {
  const reply = event.data as HostReply;
  const waiting = pending.get(reply?.id);
  if (!waiting) return;
  pending.delete(reply.id);
  if (reply.ok) waiting.resolve(reply);
  else waiting.reject(new Error(reply.error ?? 'The app window could not complete the request.'));
});

/** Tells the window program that the app itself is on screen, which ends its start-up. */
export function hostReady(): void {
  host?.postMessage({ id: 0, cmd: 'ready' });
}

/** Hands the window program what the evening reminder should say on the coming days. */
export function hostBrief(text: string): void {
  host?.postMessage({ id: 0, cmd: 'brief', text });
}

export function callHost(cmd: HostCommand, text?: string): Promise<HostReply> {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Not running in the desktop app.'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    host.postMessage({ id, cmd, text });
  });
}
