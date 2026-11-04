/** Rules and messages for sign-up and login (shared by the forms and the tests). */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Bump when the Terms or Privacy Policy change in a way people must agree to again. */
export const TERMS_VERSION = "2026-11-04";

export function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns a reason the password isn't good enough, or null when it's fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Use 72 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use at least one letter and one number.";
  if (/^(password|12345678|qwerty)/i.test(password)) return "That password is too easy to guess.";
  return null;
}

/** Safe in-app path to return to after signing in (never another website). */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** Plain-English messages for Supabase Auth errors. */
export function authMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. We can send you a new code.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "An account with this email already exists. Log in instead.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Too many tries. Please wait a few minutes and try again.";
  if (m.includes("expired") || (m.includes("invalid") && (m.includes("otp") || m.includes("token")))) return "That code is wrong or has expired. Get a new code and try again.";
  if (m.includes("weak") || m.includes("password should")) return "Choose a stronger password (at least 8 characters, with letters and numbers).";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "New sign-ups are closed right now.";
  if (m.includes("failed to fetch") || m.includes("network")) return "No internet connection. Please try again when you're back online.";
  return "Something went wrong. Please try again.";
}
