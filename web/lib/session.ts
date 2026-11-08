// Anonymous identity. No accounts in v1.
//
// The session ID lives in sessionStorage: it survives a refresh in the same tab (so the server can
// drop the stale socket immediately) but every tab gets its own, so two tabs can chat with each other.

const SESSION_KEY = "linkup:session";
const AGE_KEY = "linkup:age-confirmed";
const ACTIVE_KEY = "linkup:active";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function isAgeConfirmed(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAgeConfirmed(value: boolean) {
  try {
    if (value) localStorage.setItem(AGE_KEY, "1");
    else localStorage.removeItem(AGE_KEY);
  } catch {}
}

/** Remembers that this tab was chatting, so a refresh drops the user straight back into the queue. */
export function setActive(value: boolean) {
  try {
    if (value) sessionStorage.setItem(ACTIVE_KEY, "1");
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

export function wasActive(): boolean {
  try {
    return sessionStorage.getItem(ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}
