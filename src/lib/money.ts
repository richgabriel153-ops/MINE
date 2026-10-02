/**
 * Money helpers. Every amount in the app is an integer number of kobo
 * (₦1 = 100 kobo) so totals never suffer floating-point rounding errors.
 */

/** Largest amount we accept anywhere: ₦10 billion. Keeps maths far inside safe-integer range. */
export const MAX_KOBO = 10_000_000_000 * 100;

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

/** Format kobo as Naira: 2500000 → "₦25,000", 2500050 → "₦25,000.50", -50000 → "-₦500". */
export function formatNaira(kobo: number): string {
  if (!Number.isSafeInteger(kobo)) throw new RangeError(`Invalid kobo amount: ${kobo}`);
  const sign = kobo < 0 ? "-" : "";
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100);
  const rest = abs % 100;
  const fraction = rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`;
  return `${sign}₦${nairaFormatter.format(naira)}${fraction}`;
}

/** Format kobo for an input box (no ₦ sign): 2500050 → "25,000.50". */
export function formatKoboForInput(kobo: number): string {
  return formatNaira(kobo).replace("₦", "");
}

/**
 * Parse what a user typed into a money field into kobo.
 * Accepts "25000", "25,000", "₦25,000.5", " 1,200.75 ". Returns null when it is not a valid amount.
 * Parsing is done on the string digits, never via floating point.
 */
export function parseNairaToKobo(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, "").replace(/^N(?=\d)/i, "");
  if (cleaned === "") return null;
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const kobo = whole * 100 + fraction;
  if (!Number.isSafeInteger(kobo) || kobo > MAX_KOBO) return null;
  return kobo;
}

/** Integer division rounding half up (for non-negative numerator, positive denominator). */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Multiply kobo by a ratio given in hundredths (e.g. quantity 1.5 → 150, 7.5% → 750 basis points with scale 10000).
 * Rounds half up to the nearest kobo.
 */
export function mulDivKobo(kobo: number, multiplier: number, scale: number): number {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new RangeError(`Invalid kobo amount: ${kobo}`);
  if (!Number.isSafeInteger(multiplier) || multiplier < 0) throw new RangeError(`Invalid multiplier: ${multiplier}`);
  return Number(divRoundHalfUp(BigInt(kobo) * BigInt(multiplier), BigInt(scale)));
}

/** Percentage (up to 2 decimal places, e.g. 7.5) of an amount in kobo, rounded half up. */
export function percentOfKobo(kobo: number, percent: number): number {
  const basisPoints = Math.round(percent * 100);
  return mulDivKobo(kobo, basisPoints, 10_000);
}
