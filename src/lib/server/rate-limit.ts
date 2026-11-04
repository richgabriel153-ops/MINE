import "server-only";

import { isServerCloudConfigured, supabaseAdmin } from "./supabase-admin";

/** The caller's internet address (Vercel puts the real one first in x-forwarded-for). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/**
 * One hit against a limit shared by every server (stored in the database).
 * Returns true when allowed. `failOpen`: if the database can't be reached, allow (for pages that
 * must keep working) or refuse (for things worth guessing, like codes).
 */
export async function rateLimit(key: string, windowSeconds: number, max: number, { failOpen = true } = {}): Promise<boolean> {
  if (!isServerCloudConfigured()) return failOpen;
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.error("rate limit check failed", err);
    return failOpen;
  }
}

export function tooMany(): Response {
  return Response.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": "300" } });
}
