import "server-only";

/**
 * Pro preview mode: only on Vercel preview links (or when DEMO_MODE=on, e.g. on your own computer).
 * Never on the live app, so nobody can get Pro for free there.
 */
export function isPreviewMode(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.VERCEL_ENV === "preview" || process.env.DEMO_MODE === "on" || process.env.NODE_ENV === "development";
}
