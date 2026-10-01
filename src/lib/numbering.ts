import type { DocType } from "./types";

export const DOC_PREFIX: Record<DocType, string> = {
  receipt: "RCT",
  invoice: "INV",
};

/** formatDocNumber("receipt", 7) → "RCT-0007" */
export function formatDocNumber(type: DocType, n: number): string {
  return `${DOC_PREFIX[type]}-${String(n).padStart(4, "0")}`;
}

/** "RCT-0007" → 7, or null if it doesn't look like one of ours. */
export function parseDocNumber(value: string): { type: DocType; n: number } | null {
  const match = /^(RCT|INV)-(\d+)$/.exec(value);
  if (!match) return null;
  return { type: match[1] === "RCT" ? "receipt" : "invoice", n: Number(match[2]) };
}

export type Counters = Record<DocType, number>;

/** The highest number used so far for each type, so new numbers never repeat (e.g. after a restore). */
export function countersFromNumbers(numbers: string[], current: Counters): Counters {
  const next = { ...current };
  for (const value of numbers) {
    const parsed = parseDocNumber(value);
    if (parsed && parsed.n > next[parsed.type]) next[parsed.type] = parsed.n;
  }
  return next;
}
