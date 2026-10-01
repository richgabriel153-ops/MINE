"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PLANS } from "@/lib/billing";
import { accessToken, isCloudConfigured } from "@/lib/cloud/client";
import { formatDate, lagosDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Overview {
  users: number;
  users_7d: number;
  users_30d: number;
  businesses: number;
  businesses_7d: number;
  businesses_30d: number;
  active_7d: number;
  active_30d: number;
  pro: number;
  pro_monthly: number;
  pro_yearly: number;
  pro_comp: number;
  cancelling: number;
  payment_issues: number;
  documents: number;
  documents_30d: number;
  receipts_30d: number;
  invoices_30d: number;
  quotes_30d: number;
  online_payments_30d: number;
  online_payments_kobo_30d: number;
  payouts_connected: number;
  staff: number;
  expenses_30d: number;
  assistant_messages_today: number;
  assistant_messages_30d: number;
  assistant_input_tokens_30d: number;
  assistant_output_tokens_30d: number;
  webhooks_7d: number;
  webhook_errors: { id: string; event: string; error: string; received_at: string }[];
  signups_by_day: { day: string; count: number }[];
}

interface BusinessRow {
  id: string;
  name: string;
  owner_email: string | null;
  created_at: string;
  plan: "monthly" | "yearly" | null;
  billing_status: string;
  comp: boolean;
  is_pro: boolean;
  period_end: string | null;
  documents: number;
  documents_30d: number;
  staff: number;
  payouts_connected: boolean;
  assistant_messages_30d: number;
  last_active: string | null;
  total_count: number;
}

async function adminGet<T>(query: string): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`/api/admin?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't load. Please try again.");
  return body as T;
}

const n = (v: number | string) => Number(v).toLocaleString("en-NG");
const day = (iso: string | null) => (iso ? formatDate(lagosDate(new Date(iso))) : "—");

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-xs", tone === "warn" && "border-amber-500/50")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function planLabel(b: BusinessRow): string {
  if (b.comp) return "Pro (free)";
  if (b.is_pro && b.plan) return `Pro ${PLANS[b.plan].label.toLowerCase()}${b.billing_status === "non_renewing" ? " · cancelling" : ""}`;
  if (b.billing_status === "attention") return "Payment failed";
  return "Free";
}

export function AdminPanel() {
  const [state, setState] = useState<"loading" | "denied" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [customModel, setCustomModel] = useState<string | null>(null);
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

  const loadOverview = useCallback(async () => {
    try {
      const { admin } = await adminGet<{ admin: boolean }>("view=check");
      if (!admin) return setState("denied");
      const res = await adminGet<{ overview: Overview; model: string | null }>("view=overview");
      setOverview(res.overview);
      setCustomModel(res.model);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!isCloudConfigured()) return;
    let active = true;
    adminGet<{ admin: boolean }>("view=check")
      .then(async ({ admin }) => {
        if (!active) return;
        if (!admin) return setState("denied");
        const res = await adminGet<{ overview: Overview; model: string | null }>("view=overview");
        if (!active) return;
        setOverview(res.overview);
        setCustomModel(res.model);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    let active = true;
    adminGet<{ businesses: BusinessRow[] }>(`view=businesses&q=${encodeURIComponent(query)}&offset=${offset}`)
      .then((res) => active && setRows(res.businesses))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, [state, query, offset]);

  if (!isCloudConfigured()) return <p className="rounded-xl border bg-card p-4 text-sm">Accounts (Supabase) aren&apos;t set up yet.</p>;
  if (state === "loading") return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (state === "denied")
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        This page is for InCeipt admins only. Sign in with an admin email (listed in the ADMIN_EMAILS setting).
      </p>
    );
  if (state === "error" || !overview)
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
        <p>{error || "Couldn't load."}</p>
        <Button variant="outline" onClick={loadOverview}>
          Try again
        </Button>
      </div>
    );

  const o = overview;
  const mrrKobo = Math.round(o.pro_monthly * PLANS.monthly.kobo + (o.pro_yearly * PLANS.yearly.kobo) / 12);
  // Rough cost at Claude Opus 5.5 list prices ($4 / $20 per million tokens), before prompt-cache discounts.
  const usd = (o.assistant_input_tokens_30d * 4 + o.assistant_output_tokens_30d * 20) / 1_000_000;
  const maxSignups = Math.max(1, ...o.signups_by_day.map((d) => Number(d.count)));
  const total = rows[0]?.total_count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Accounts only. Phone-only users keep their records on their phone, so they aren&apos;t counted.</p>
        <Button variant="ghost" size="icon" aria-label="Refresh" onClick={loadOverview}>
          <RefreshCw />
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Revenue</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Monthly recurring revenue" value={formatNaira(mrrKobo)} sub={`${formatNaira(mrrKobo * 12)} a year`} />
          <Stat label="Pro businesses" value={n(o.pro)} sub={`${n(o.pro_monthly)} monthly · ${n(o.pro_yearly)} yearly · ${n(o.pro_comp)} free`} />
          <Stat label="Cancelling" value={n(o.cancelling)} sub="Pro until period ends" />
          <Stat label="Payment failed" value={n(o.payment_issues)} tone={o.payment_issues ? "warn" : undefined} sub="Renewal needs attention" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Growth</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Accounts" value={n(o.users)} sub={`+${n(o.users_7d)} this week · +${n(o.users_30d)} in 30 days`} />
          <Stat label="Businesses" value={n(o.businesses)} sub={`+${n(o.businesses_7d)} this week · +${n(o.businesses_30d)} in 30 days`} />
          <Stat label="Active this week" value={n(o.active_7d)} sub={`${n(o.active_30d)} in 30 days`} />
          <Stat label="Conversion to Pro" value={o.businesses ? `${Math.round((o.pro / o.businesses) * 100)}%` : "—"} />
        </div>
        {o.signups_by_day.length > 0 && (
          <Card>
            <CardContent>
              <div className="mb-2 text-xs text-muted-foreground">New businesses per day, last 30 days</div>
              <div className="flex h-20 items-end gap-0.5" role="img" aria-label="New businesses per day">
                {o.signups_by_day.map((d) => (
                  <div
                    key={d.day}
                    title={`${formatDate(d.day)}: ${d.count}`}
                    className="flex-1 rounded-t bg-primary"
                    style={{ height: `${Math.max(6, (Number(d.count) / maxSignups) * 100)}%` }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Usage, last 30 days</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Documents made" value={n(o.documents_30d)} sub={`${n(o.receipts_30d)} receipts · ${n(o.invoices_30d)} invoices · ${n(o.quotes_30d)} quotes`} />
          <Stat label="Paid online" value={formatNaira(Number(o.online_payments_kobo_30d))} sub={`${n(o.online_payments_30d)} payments · ${n(o.payouts_connected)} businesses connected`} />
          <Stat label="Assistant messages" value={n(o.assistant_messages_30d)} sub={`${n(o.assistant_messages_today)} today`} />
          <Stat
            label="Assistant AI cost"
            value={customModel ? `${n(o.assistant_input_tokens_30d + o.assistant_output_tokens_30d)} tokens` : `≈ $${usd.toFixed(2)}`}
            sub={customModel ? `Model: ${customModel}` : "At list prices, before caching"}
          />
          <Stat label="Expenses logged" value={n(o.expenses_30d)} />
          <Stat label="Active staff" value={n(o.staff)} sub={`${n(o.documents)} documents all time`} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Paystack webhooks</h2>
        <Stat label="Received this week" value={n(o.webhooks_7d)} />
        {o.webhook_errors.length > 0 && (
          <Card className="border-amber-500/50">
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4 text-amber-600" /> Recent errors
              </div>
              {o.webhook_errors.map((e) => (
                <div key={e.id} className="border-t pt-2">
                  <div className="font-medium">
                    {e.event} · {day(e.received_at)}
                  </div>
                  <div className="break-words text-muted-foreground">{e.error}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Businesses {total ? `(${n(total)})` : ""}</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setQuery(search.trim());
          }}
        >
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Business name or owner email" aria-label="Search businesses" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
        </form>
        <ul className="flex flex-col gap-2">
          {rows.map((b) => (
            <li key={b.id} className="rounded-xl border bg-card p-3 text-sm shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{b.name || "(no name)"}</div>
                  <div className="truncate text-muted-foreground">{b.owner_email ?? "—"}</div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    b.is_pro ? "bg-primary/10 text-primary" : b.billing_status === "attention" ? "bg-amber-500/15 text-amber-800" : "bg-muted",
                  )}
                >
                  {planLabel(b)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground tabular-nums">
                <span>Joined {day(b.created_at)}</span>
                <span>Active {day(b.last_active)}</span>
                <span>{b.period_end && b.is_pro && !b.comp ? `Renews ${day(b.period_end)}` : ""}</span>
                <span>
                  {n(b.documents)} docs ({n(b.documents_30d)} new)
                </span>
                <span>{n(b.staff)} staff</span>
                <span>
                  {b.payouts_connected ? "Pay Now on" : "No Pay Now"} · {n(b.assistant_messages_30d)} AI
                </span>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No businesses found.</li>}
        </ul>
        {total > 50 && (
          <div className="flex justify-between">
            <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
              Previous
            </Button>
            <Button variant="outline" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>
              Next
            </Button>
          </div>
        )}
      </section>
      <p className="text-center text-xs text-muted-foreground">
        Customer details and document contents are never shown here (privacy, NDPA 2023).
      </p>
    </div>
  );
}
