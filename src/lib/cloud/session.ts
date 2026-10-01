import { isCloudConfigured, supabase } from "./client";

const BUSINESS_KEY = "inceipt.business";

export interface CloudContext {
  userId: string;
  email: string;
  businessId: string;
}

export function getActiveBusinessId(): string | null {
  try {
    return localStorage.getItem(BUSINESS_KEY);
  } catch {
    return null;
  }
}

export function setActiveBusinessId(id: string | null): void {
  try {
    if (id) localStorage.setItem(BUSINESS_KEY, id);
    else localStorage.removeItem(BUSINESS_KEY);
  } catch {
    // ignore (private mode)
  }
}

/** Signed in AND a business chosen → records live in the account. Otherwise they're on this phone. */
export async function getCloudContext(): Promise<CloudContext | null> {
  if (typeof window === "undefined" || !isCloudConfigured()) return null;
  const businessId = getActiveBusinessId();
  if (!businessId) return null;
  const { data } = await supabase().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  return { userId: user.id, email: user.email ?? "", businessId };
}

export async function getSignedInEmail(): Promise<string | null> {
  if (!isCloudConfigured()) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.email ?? null;
}

export async function signOut(): Promise<void> {
  setActiveBusinessId(null);
  if (isCloudConfigured()) await supabase().auth.signOut();
}
