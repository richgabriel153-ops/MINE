import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REASONS = ["nudity", "harassment", "underage", "spam", "other"] as const;
type Reason = (typeof REASONS)[number];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

// Light in-memory rate limit (per server instance): 10 reports per minute per IP.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ ok: false, error: "Too many reports" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const reason = str(body.reason, 20) as Reason;
  const reporter = str(body.reporterSessionId, 64);
  if (!REASONS.includes(reason) || !reporter) {
    return NextResponse.json({ ok: false, error: "Missing reason or session" }, { status: 400 });
  }

  const row = {
    reporter_session_id: reporter,
    reported_session_id: str(body.reportedSessionId, 64) || null,
    match_id: str(body.matchId, 64) || null,
    reason,
    note: str(body.note, 500) || null,
  };

  if (!supabase) {
    // Lets the whole flow be tested locally without a Supabase project.
    console.warn("[report] Supabase not configured; report not stored:", row);
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true, stored: false });
    return NextResponse.json({ ok: false, error: "Reports are not configured" }, { status: 503 });
  }

  const { error } = await supabase.from("reports").insert(row);
  if (error) {
    console.error("[report] insert failed", error);
    return NextResponse.json({ ok: false, error: "Could not save report" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: true });
}
