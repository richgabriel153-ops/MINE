import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Server-only Supabase client with the service role key. It bypasses database rules, so it is
 * only used in API routes after checking who is calling (or for verified Paystack webhooks).
 */
let admin: SupabaseClient | null = null;

export function isServerCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseAdmin(): SupabaseClient {
  if (!isServerCloudConfigured()) throw new Error("Supabase isn't configured on the server.");
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** The signed-in user making this request (from "Authorization: Bearer <access token>"), or null. */
export async function requestUser(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !isServerCloudConfigured()) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  return error ? null : data.user;
}

/** The caller's active role in a business ("owner" | "staff"), or null. */
export async function memberRole(userId: string, businessId: string): Promise<"owner" | "staff" | null> {
  const { data } = await supabaseAdmin()
    .from("members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (data?.role as "owner" | "staff" | undefined) ?? null;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
