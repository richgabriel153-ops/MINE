import { timingSafeEqual } from "node:crypto";

/**
 * TEMPORARY Pro unlock check.
 *
 * Codes come from the PRO_UNLOCK_CODES environment variable (comma-separated) and are only ever
 * read on the server, so they are not visible in the app's code. This is a stop-gap: any code can
 * be shared and reused. Replace with a proper backend (one code per buyer, created by a Paystack
 * webhook, tied to the buyer's phone or email) before this matters.
 */

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseCodeList(env: string | undefined): string[] {
  return (env ?? "")
    .split(",")
    .map(normaliseCode)
    .filter((c) => c.length >= 4);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function isValidUnlockCode(code: string, env: string | undefined): boolean {
  const candidate = normaliseCode(code);
  if (candidate.length < 4 || candidate.length > 64) return false;
  // Check every code (no early exit) so timing doesn't hint at partial matches.
  return parseCodeList(env).reduce((found, valid) => safeEqual(candidate, valid) || found, false);
}
