import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, friendlyError, REQUEST_TIMEOUT_MS } from "@/lib/cloud/client";
import { isNetworkError } from "@/lib/offline-cache";

/** A fetch that never answers until it is aborted (like a dead mobile connection). */
function hangingFetch() {
  return vi.fn((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("slow or patchy connections", () => {
  it("gives up after the time limit instead of spinning forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());
    const p = fetchWithTimeout("https://x.supabase.co/rest/v1/documents");
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
    const err = await caught;
    expect(String(err)).toMatch(/timed out/i);
    expect(friendlyError(err).message).toMatch(/taking too long/);
    expect(isNetworkError(err)).toBe(true);
  });

  it("still passes a cancel from the caller through", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const c = new AbortController();
    const p = fetchWithTimeout("https://x.supabase.co/rest/v1/documents", { signal: c.signal });
    c.abort(new DOMException("cancelled", "AbortError"));
    await expect(p).rejects.toThrow(/cancelled/);
  });

  it("says 'no internet' in plain words, including on iPhones", () => {
    expect(friendlyError(new TypeError("Failed to fetch")).message).toMatch(/No internet/);
    expect(friendlyError(new TypeError("Load failed")).message).toMatch(/No internet/);
  });
});

describe("error messages people see", () => {
  const dbError = (message: string) => ({ message, code: "P0001", details: null, hint: null });

  it("turns every database error code into plain English", () => {
    for (const code of ["already_converted", "already_paid", "bad_amount", "bad_categories", "bad_email", "bad_status", "bad_type", "is_owner", "not_found", "not_member", "not_signed_in", "nothing_to_pay", "owner_only", "payouts_not_connected", "pro_required"]) {
      const m = friendlyError(dbError(code)).message;
      expect(m, code).not.toMatch(/_/);
      expect(m, code).not.toMatch(/on our side/);
    }
  });

  it("hides unknown technical database wording", () => {
    expect(friendlyError(dbError('relation "public.x" does not exist')).message).toMatch(/on our side/);
  });

  it("keeps our own plain messages", () => {
    expect(friendlyError(new Error("Choose a customer first.")).message).toBe("Choose a customer first.");
  });
});
