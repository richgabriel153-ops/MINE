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
import { usePreviewMode } from "@/lib/preview";
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
  const res = await fetch(`/api/admin?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
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
  if (b.is_pro && b.plan)
    return `Pro ${PLANS[b.plan].label.toLowerCase()}${b.billing_status === "non_renewing" ? " · cancelling" : ""}`;
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
  const [sample, setSample] = useState(false);
  const preview = usePreviewMode();

  const showSample = () => {
    setSample(true);
    setOverview(sampleOverview());
    setCustomModel(null);
    setRows(SAMPLE_ROWS);
    setState("ready");
  };

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
    if (state !== "ready" || sample) return;
    let active = true;
    adminGet<{ businesses: BusinessRow[] }>(`view=businesses&q=${encodeURIComponent(query)}&offset=${offset}`)
      .then((res) => active && setRows(res.businesses))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, [state, query, offset, sample]);

  const sampleOffer = preview?.enabled && (
    <Button variant="outline" onClick={showSample}>
      See it with sample data (test link)
    </Button>
  );

  if (!isCloudConfigured() && !sample)
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
        <p>Accounts (Supabase) aren&apos;t set up yet, so there are no users to show.</p>
        {sampleOffer}
      </div>
    );
  if (state === "loading") return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (state === "denied")
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        This page is for InCeipt admins only. Sign in with an admin email (listed in the ADMIN_EMAILS setting).
        {sampleOffer && <span className="mt-3 flex">{sampleOffer}</span>}
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
  // Whole naira: yearly plans are spread over 12 months.
  const mrrKobo = Math.round((o.pro_monthly * PLANS.monthly.kobo + (o.pro_yearly * PLANS.yearly.kobo) / 12) / 100) * 100;
  // Rough cost at Claude Opus 5.5 list prices ($4 / $20 per million tokens), before prompt-cache discounts.
  const usd = (o.assistant_input_tokens_30d * 4 + o.assistant_output_tokens_30d * 20) / 1_000_000;
  const maxSignups = Math.max(1, ...o.signups_by_day.map((d) => Number(d.count)));
  const shownRows =
    sample && query
      ? rows.filter((b) => `${b.name} ${b.owner_email}`.toLowerCase().includes(query.toLowerCase()))
      : rows;
  const total = sample ? shownRows.length : (rows[0]?.total_count ?? 0);

  return (
    <div className="flex flex-col gap-5">
      {sample && (
        <p className="rounded-xl border border-dashed border-primary/50 bg-secondary p-3 text-sm">
          <strong>Sample data.</strong> This is what the dashboard looks like with real users. Your real numbers appear
          once Supabase is set up and you sign in with an email in ADMIN_EMAILS.
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Accounts only. Phone-only users keep their records on their phone, so they aren&apos;t counted.
        </p>
        <Button variant="ghost" size="icon" aria-label="Refresh" onClick={loadOverview}>
          <RefreshCw />
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Revenue</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Monthly recurring revenue"
            value={formatNaira(mrrKobo)}
            sub={`${formatNaira(mrrKobo * 12)} a year`}
          />
          <Stat
            label="Pro businesses"
            value={n(o.pro)}
            sub={`${n(o.pro_monthly)} monthly · ${n(o.pro_yearly)} yearly · ${n(o.pro_comp)} free`}
          />
          <Stat label="Cancelling" value={n(o.cancelling)} sub="Pro until period ends" />
          <Stat
            label="Payment failed"
            value={n(o.payment_issues)}
            tone={o.payment_issues ? "warn" : undefined}
            sub="Renewal needs attention"
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Growth</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Accounts"
            value={n(o.users)}
            sub={`+${n(o.users_7d)} this week · +${n(o.users_30d)} in 30 days`}
          />
          <Stat
            label="Businesses"
            value={n(o.businesses)}
            sub={`+${n(o.businesses_7d)} this week · +${n(o.businesses_30d)} in 30 days`}
          />
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
          <Stat
            label="Documents made"
            value={n(o.documents_30d)}
            sub={`${n(o.receipts_30d)} receipts · ${n(o.invoices_30d)} invoices · ${n(o.quotes_30d)} quotes`}
          />
          <Stat
            label="Paid online"
            value={formatNaira(Number(o.online_payments_kobo_30d))}
            sub={`${n(o.online_payments_30d)} payments · ${n(o.payouts_connected)} businesses connected`}
          />
          <Stat
            label="Assistant messages"
            value={n(o.assistant_messages_30d)}
            sub={`${n(o.assistant_messages_today)} today`}
          />
          <Stat
            label="Assistant AI cost"
            value={
              customModel
                ? `${n(o.assistant_input_tokens_30d + o.assistant_output_tokens_30d)} tokens`
                : `≈ $${usd.toFixed(2)}`
            }
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business name or owner email"
            aria-label="Search businesses"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Search">
            <Search />
          </Button>
        </form>
        <ul className="flex flex-col gap-2">
          {shownRows.map((b) => (
            <li key={b.id} className="rounded-xl border bg-card p-3 text-sm shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{b.name || "(no name)"}</div>
                  <div className="truncate text-muted-foreground">{b.owner_email ?? "—"}</div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    b.is_pro
                      ? "bg-primary/10 text-primary"
                      : b.billing_status === "attention"
                        ? "bg-amber-500/15 text-amber-800"
                        : "bg-muted",
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
          {shownRows.length === 0 && (
            <li className="py-4 text-center text-sm text-muted-foreground">No businesses found.</li>
          )}
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

/* ---------- Sample data (Pro preview on test links only) ---------- */

function sampleOverview(): Overview {
  const today = new Date();
  const signups = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today.getTime() - (29 - i) * 86_400_000);
    return {
      day: d.toISOString().slice(0, 10),
      count: [2, 3, 1, 4, 6, 3, 2, 5, 7, 4, 3, 6, 8, 5, 4, 7, 9, 6, 5, 8, 10, 7, 6, 9, 11, 8, 7, 10, 12, 9][i],
    };
  });
  return {
    users: 1284,
    users_7d: 61,
    users_30d: 196,
    businesses: 1197,
    businesses_7d: 57,
    businesses_30d: 181,
    active_7d: 642,
    active_30d: 911,
    pro: 143,
    pro_monthly: 96,
    pro_yearly: 38,
    pro_comp: 9,
    cancelling: 7,
    payment_issues: 3,
    documents: 48_210,
    documents_30d: 9_874,
    receipts_30d: 6_912,
    invoices_30d: 2_315,
    quotes_30d: 647,
    online_payments_30d: 412,
    online_payments_kobo_30d: 1_874_350_000,
    payouts_connected: 58,
    staff: 74,
    expenses_30d: 2_106,
    assistant_messages_today: 188,
    assistant_messages_30d: 4_960,
    assistant_input_tokens_30d: 29_800_000,
    assistant_output_tokens_30d: 1_640_000,
    webhooks_7d: 236,
    webhook_errors: [
      {
        id: "s1",
        event: "charge.success",
        error: "Subscription not found for customer CUS_x9 (retried, fixed)",
        received_at: new Date(today.getTime() - 2 * 86_400_000).toISOString(),
      },
    ],
    signups_by_day: signups,
  };
}

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const row = (
  id: string,
  name: string,
  email: string,
  joined: number,
  plan: BusinessRow["plan"],
  status: string,
  docs: number,
  docs30: number,
  staff: number,
  payouts: boolean,
  ai: number,
  active: number,
  extra: Partial<BusinessRow> = {},
): BusinessRow => ({
  id,
  name,
  owner_email: email,
  created_at: ago(joined),
  plan,
  billing_status: status,
  comp: false,
  is_pro: status === "active" || status === "non_renewing",
  period_end: plan ? ago(-(plan === "yearly" ? 200 : 18)) : null,
  documents: docs,
  documents_30d: docs30,
  staff,
  payouts_connected: payouts,
  assistant_messages_30d: ai,
  last_active: ago(active),
  total_count: 8,
  ...extra,
});
const SAMPLE_ROWS: BusinessRow[] = [
  row("b1", "Mama Chi Kitchen", "chi.okeke@gmail.com", 3, "monthly", "active", 41, 41, 1, true, 63, 0),
  row("b2", "Ade Phones & Accessories", "ade.phones@yahoo.com", 11, null, "none", 27, 22, 0, false, 0, 1),
  row("b3", "Zainab Events Ltd", "hello@zainabevents.ng", 45, "yearly", "active", 312, 88, 4, true, 210, 0),
  row("b4", "Kunle Auto Spare Parts", "kunle.spares@gmail.com", 60, "monthly", "attention", 198, 30, 2, false, 12, 3),
  row("b5", "Bella's Hair Studio", "bellahair@gmail.com", 72, null, "none", 94, 19, 0, false, 0, 6),
  row("b6", "Emeka Fabrics", "emeka.fabrics@outlook.com", 90, "monthly", "non_renewing", 260, 45, 1, true, 34, 2),
  row("b7", "Grace Pharmacy", "gracepharm@gmail.com", 120, null, "none", 15, 0, 0, false, 0, 40),
  row("b8", "Tunde Logistics", "ops@tundelogistics.ng", 150, null, "none", 402, 120, 3, true, 95, 0, {
    comp: true,
    is_pro: true,
  }),
];
