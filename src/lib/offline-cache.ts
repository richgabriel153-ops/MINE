/**
 * A small copy of the latest records on this phone, so screens can still show something when the
 * network drops. It is read-only: saving always needs the internet (numbers are given by the server).
 * Cleared on log out.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "inceipt-cache";
const STORE = "kv";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  try {
    await (await db()).put(STORE, { value, savedAt: new Date().toISOString() }, key);
  } catch {
    // Storage full or blocked: the app still works online.
  }
}

export async function cacheGet<T>(key: string): Promise<{ value: T; savedAt: string } | undefined> {
  try {
    return (await (await db()).get(STORE, key)) as { value: T; savedAt: string } | undefined;
  } catch {
    return undefined;
  }
}

export async function cacheClear(): Promise<void> {
  try {
    await (await db()).clear(STORE);
  } catch {
    // ignore
  }
}

/** True for "no internet" style failures (not for "you're not allowed"). */
export function isNetworkError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|network request failed|load failed|no internet|offline|timed? ?out/i.test(m) ||
    (typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Try the network; on a network failure use the saved copy (and say so). On success, save a copy. */
export async function withOfflineCopy<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    void cachePut(key, value);
    return value;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const saved = await cacheGet<T>(key);
    if (saved) {
      markOffline(saved.savedAt);
      return saved.value;
    }
    throw err;
  }
}

type Listener = (savedAt: string | null) => void;
const listeners = new Set<Listener>();

/** The screens show a small "You're offline" note while a saved copy is on screen. */
function markOffline(savedAt: string) {
  for (const l of listeners) l(savedAt);
}

export function onOfflineCopy(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
