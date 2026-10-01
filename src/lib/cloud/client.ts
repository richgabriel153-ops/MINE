import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Accounts are switched on once the Supabase settings are added in Vercel. */
export function isCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/** The browser's Supabase client (uses the public anon key; access is controlled by database rules). */
export function supabase(): SupabaseClient {
  if (!isCloudConfigured()) throw new Error("Accounts aren't set up yet.");
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "inceipt-auth" },
  });
  return client;
}

/** The signed-in user's access token, for calling our own /api routes. */
export async function accessToken(): Promise<string | null> {
  if (!isCloudConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Turn database error codes into plain English. */
export function friendlyError(err: unknown): Error {
  const message = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  if (/owner_only/.test(message)) return new Error("Only the business owner can do this.");
  if (/pro_required/.test(message)) return new Error("This needs InCeipt Pro.");
  if (/not_member/.test(message)) return new Error("You no longer have access to this business.");
  if (/already_paid/.test(message)) return new Error("This invoice has already been marked as paid.");
  if (/bad_amount/.test(message)) return new Error("That amount is more than what's left to pay.");
  if (/Failed to fetch|NetworkError|network/i.test(message)) return new Error("No internet connection. Please try again when you're back online.");
  return new Error(message || "Something went wrong. Please try again.");
}
