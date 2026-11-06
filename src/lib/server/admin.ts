import "server-only";

import type { User } from "@supabase/supabase-js";

/** Admins are listed by email in the ADMIN_EMAILS setting (comma separated). Never sent to the browser. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: User | null): boolean {
  if (!user?.email || !user.email_confirmed_at) return false;
  return adminEmails().includes(user.email.toLowerCase());
}
