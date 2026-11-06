import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Accounts are switched on once the Supabase settings are added in Vercel. */
export function isCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/** How long to wait on a slow connection before giving up (photo uploads get longer). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 90_000;

/** fetch that gives up after a while, so a bad network shows a message instead of spinning forever. */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const ms = url.includes("/storage/v1/") ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  // Built by hand (not AbortSignal.timeout/any) so it also works on older phone browsers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), ms);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

/** The browser's Supabase client (uses the public anon key; access is controlled by database rules). */
export function supabase(): SupabaseClient {
  if (!isCloudConfigured()) throw new Error("Accounts aren't set up yet.");
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "inceipt-auth" },
    global: { fetch: fetchWithTimeout },
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
  if (/already_converted/.test(message)) return new Error("This quote has already been turned into an invoice.");
  if (/payouts_not_connected/.test(message)) return new Error("Online payments aren't set up for this business yet.");
  if (/nothing_to_pay/.test(message)) return new Error("This invoice is already fully paid.");
  if (/bad_email/.test(message)) return new Error("That email address doesn't look right.");
  if (/is_owner/.test(message)) return new Error("That's the owner's email.");
  if (/bad_categories/.test(message)) return new Error("Check the expense categories (short names, no duplicates).");
  if (/bad_status|bad_type/.test(message)) return new Error("That change isn't allowed for this record.");
  if (/not_found/.test(message)) return new Error("We couldn't find that record. It may have been deleted.");
  if (/not_signed_in|JWT expired|invalid JWT/i.test(message)) return new Error("Please log in again to continue.");
  const bad = /invalid_input:([a-z_]+)/.exec(message);
  if (bad) return new Error(INVALID_INPUT[bad[1]] ?? "Something in this form isn't right. Please check it and try again.");
  if (/rate_limited/.test(message)) return new Error("Too many tries. Please wait a little and try again.");
  if (/timed? ?out|timeout|aborted/i.test(message))
    return new Error("This is taking too long; your connection may be slow. If you were saving, check History before trying again.");
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(message)) return new Error("No internet connection. Please try again when you're back online.");
  // Other database or server errors: don't show their technical wording to people.
  const fromServer = typeof err === "object" && err !== null && ("code" in err || "status" in err || "hint" in err);
  if (fromServer || !message) return new Error("Something went wrong on our side. Please try again in a moment.");
  return new Error(message);
}

/** Plain-English messages for the server's input checks (invalid_input:<field>). */
const INVALID_INPUT: Record<string, string> = {
  items: "Add at least one item (200 at most).",
  item_description: "Every item needs a description (up to 300 characters).",
  item_quantity: "Every item needs a quantity above 0.",
  item_price: "Check the item prices.",
  customer_name: "The customer's name is too long (120 characters at most).",
  customer_phone: "Enter a Nigerian mobile number, e.g. 0803 123 4567, or leave it empty.",
  customer_exists: "You already have a customer with this phone number.",
  discount: "Check the discount: it can't be more than 100% or below zero.",
  delivery: "Check the delivery fee.",
  amount_paid: "The amount paid must be more than ₦0 and less than the total. If it's all paid, choose Paid.",
  method: "Choose how the customer paid.",
  notes: "The notes are too long (1,000 characters at most).",
  issue_date: "Choose a valid date.",
  date: "Choose a valid date.",
  due_date: "The due date can't be before the document date.",
  too_large: "This document is too large. Try fewer or shorter items.",
  logo: "That logo picture can't be used. Please choose another picture.",
  logo_too_large: "That logo is too large. Please choose a smaller picture.",
  brand_color: "Choose a colour from the list.",
  account_number: "Bank account numbers have 10 digits.",
  too_many_businesses: "You can own up to 5 businesses.",
};
