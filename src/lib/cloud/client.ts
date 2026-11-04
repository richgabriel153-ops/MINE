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
  const bad = /invalid_input:([a-z_]+)/.exec(message);
  if (bad) return new Error(INVALID_INPUT[bad[1]] ?? "Something in this form isn't right. Please check it and try again.");
  if (/rate_limited/.test(message)) return new Error("Too many tries. Please wait a little and try again.");
  if (/Failed to fetch|NetworkError|network/i.test(message)) return new Error("No internet connection. Please try again when you're back online.");
  return new Error(message || "Something went wrong. Please try again.");
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
