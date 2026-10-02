/**
 * Nigerian mobile numbers. Accepts the ways people actually type them:
 *   08031234567, 8031234567, 2348031234567, +2348031234567, +234 0803 123 4567, 0803-123-4567
 * and stores them in one form: +2348031234567.
 */

// Nigerian mobile numbers (without the leading 0) are 10 digits starting 70, 80, 81, 90 or 91.
const NATIONAL_MOBILE = /^[789][01]\d{8}$/;

/** Returns +234XXXXXXXXXX, or null if this is not a valid Nigerian mobile number. */
export function normaliseNgPhone(input: string): string | null {
  let digits = input.trim();
  const hadPlus = digits.startsWith("+");
  digits = digits.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith("234")) {
    digits = digits.slice(3);
    // People often write +234 0803… — drop the extra 0.
    if (digits.startsWith("0")) digits = digits.slice(1);
  } else if (hadPlus) {
    // A + with any other country code is not Nigerian.
    return null;
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return NATIONAL_MOBILE.test(digits) ? `+234${digits}` : null;
}

/** +2348031234567 → "0803 123 4567". Anything else is returned unchanged. */
export function formatNgPhone(e164: string): string {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]} ${match[2]} ${match[3]}`;
}

/** +2348031234567 → "2348031234567", the format wa.me links need. */
export function whatsappDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}
