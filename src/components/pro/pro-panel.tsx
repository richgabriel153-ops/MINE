"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, Check, CreditCard, KeyRound, Loader2, Lock, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { BoldTemplate } from "@/components/templates/bold";
import { ClassicTemplate } from "@/components/templates/classic";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { billingSummary, PLANS, YEARLY_SAVING_KOBO, type Plan } from "@/lib/billing";
import { BRAND } from "@/lib/brand";
import { accessToken, isCloudConfigured } from "@/lib/cloud/client";
import { setProUnlocked } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { PRO_BENEFITS, PRO_COMPARISON } from "@/lib/pro";
import { SAMPLE_PROFILE, SAMPLE_RECEIPT } from "@/lib/sample";
import { cn } from "@/lib/utils";

const GOLD = BRAND.amber;

const FAQ = [
  {
    q: "Can I switch between monthly and yearly?",
    a: "Yes. Your current plan runs to the end of what you've paid for, then the new plan starts automatically on the same card.",
  },
  {
    q: "What happens if I cancel?",
    a: "Pro stays on until the end of the period you've paid for. Then you move to Free. All your receipts, invoices and records stay safe.",
  },
  {
    q: "What if a renewal payment fails?",
    a: "Pro keeps working for 3 more days while you update your card. After that it pauses until payment goes through.",
  },
  {
    q: "Is my payment safe?",
    a: "Yes. Payment is handled by Paystack, a licensed payment company used by thousands of Nigerian businesses. InCeipt never sees your card details.",
  },
] as const;

async function billingAction(action: string, businessId: string, plan?: Plan): Promise<{ url?: string; error?: string }> {
  const token = await accessToken();
  const res = await fetch("/api/billing", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, businessId, plan }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

function Cell({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (value === true)
    return <Check className={cn("mx-auto size-5", pro ? "text-primary" : "text-muted-foreground")} aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto size-5 text-muted-foreground/60" aria-label="Not included" />;
  return <span className={cn("text-sm", pro ? "font-semibold text-foreground" : "text-muted-foreground")}>{value}</span>;
}

function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide text-[#33250a]", className)}
      style={{ backgroundColor: GOLD }}
    >
      <Sparkles className="size-3.5" /> PRO
    </span>
  );
}

function PlanPicker({ value, onChange }: { value: Plan; onChange: (p: Plan) => void }) {
  return (
    <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2">
      {(["yearly", "monthly"] as const).map((p) => {
        const selected = value === p;
        const plan = PLANS[p];
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p)}
            className={cn(
              "relative flex cursor-pointer flex-col items-start rounded-2xl border-2 p-3 text-left transition-colors",
              selected ? "border-[var(--gold)] bg-white/10" : "border-white/15 bg-white/5",
            )}
            style={{ "--gold": GOLD } as React.CSSProperties}
          >
            {p === "yearly" && (
              <span className="absolute -top-2.5 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#33250a]" style={{ backgroundColor: GOLD }}>
                BEST DEAL
              </span>
            )}
            <span className="text-sm font-semibold text-white/80">{plan.label}</span>
            <span className="text-xl font-extrabold tracking-tight">{formatNaira(plan.kobo)}</span>
            <span className="text-xs text-white/65">per {plan.per}</span>
            {p === "yearly" && <span className="mt-1 text-xs font-semibold" style={{ color: GOLD }}>Save {formatNaira(YEARLY_SAVING_KOBO)} vs monthly</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ProPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const { access, reload } = useAccess();
  const [plan, setPlan] = useState<Plan>("yearly");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Back from Paystack: confirm the new plan straight away (the webhook may still be on its way).
  const returning = params.get("checkout") === "done";
  useEffect(() => {
    if (!returning || !access?.cloud) return;
    let active = true;
    billingAction("sync", access.cloud.businessId)
      .then(async () => {
        if (!active) return;
        await reload();
        toast.success("Payment received. Welcome to InCeipt Pro!");
        router.replace("/pro");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when returning from checkout
  }, [returning, access?.cloud?.businessId]);

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  if (access.mode === "cloud" && access.role !== "owner")
    return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner manages the plan.</p>;

  async function run(action: string, p?: Plan) {
    if (!access?.cloud) return;
    setBusy(action);
    try {
      const res = await billingAction(action, access.cloud.businessId, p);
      if (res.url) {
        window.location.href = res.url; // Paystack's secure page
        return;
      }
      await reload();
      toast.success(
        action === "cancel" ? "Your plan won't renew." : action === "resume" ? "Your plan will renew as normal." : "Your plan has been updated.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const summary = billingSummary(access);
  const subscribed = access.proSource === "subscription";
  const honoured = access.proSource === "legacy" || access.proSource === "comp";
  const cloud = access.cloud;

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-[#1c1e33] px-5 pt-6 pb-7 text-white shadow-lg">
        <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-48 rounded-full blur-3xl" style={{ backgroundColor: `${GOLD}33` }} />
        <div className="relative flex flex-col gap-4">
          <ProBadge className="self-start" />
          {access.isPro ? (
            <>
              <h2 className="text-[1.6rem] leading-[1.15] font-extrabold tracking-tight">You&apos;re on InCeipt Pro</h2>
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="font-semibold">{summary.title}</div>
                <div className="text-sm text-white/75">{summary.detail}</div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-[1.75rem] leading-[1.15] font-extrabold tracking-tight">Run your business like a big brand</h2>
              <p className="text-white/75">Track debts, take payments online, send quotes, see your profit and add your staff.</p>
              {cloud?.billingStatus && cloud.billingStatus !== "none" && (
                <div className="rounded-xl bg-white/10 p-3 text-sm">
                  <span className="font-semibold">{summary.title}.</span> {summary.detail}
                </div>
              )}
              <PlanPicker value={plan} onChange={setPlan} />
              {access.mode === "cloud" ? (
                <Button
                  size="lg"
                  className="h-14 w-full text-base font-bold text-[#33250a] hover:opacity-95"
                  style={{ backgroundColor: GOLD }}
                  disabled={busy !== null || !isCloudConfigured()}
                  onClick={() => run("checkout", plan)}
                >
                  {busy === "checkout" ? <Loader2 className="animate-spin" /> : null}
                  Upgrade: {formatNaira(PLANS[plan].kobo)}/{PLANS[plan].per} <ArrowRight />
                </Button>
              ) : isCloudConfigured() ? (
                <Button asChild size="lg" className="h-14 w-full text-base font-bold text-[#33250a]" style={{ backgroundColor: GOLD }}>
                  <Link href="/account?next=%2Fpro">
                    Create free account to upgrade <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <p className="rounded-xl bg-white/10 p-3 text-sm text-white/80">Upgrading opens soon. Please check back.</p>
              )}
              <p className="flex items-center justify-center gap-1.5 text-xs text-white/60">
                <Lock className="size-3.5" /> Secure payment by Paystack · Cancel any time
              </p>
            </>
          )}
        </div>
      </section>

      {/* Manage plan */}
      {subscribed && cloud && (
        <section aria-labelledby="manage" className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-xs">
          <h2 id="manage" className="font-bold">
            Manage your plan
          </h2>
          {cloud.billingStatus !== "non_renewing" || cloud.pendingPlan ? (
            (["yearly", "monthly"] as const)
              .filter((p) => p !== (cloud.pendingPlan ?? cloud.plan))
              .map((p) => (
                <Button key={p} variant="outline" disabled={busy !== null} onClick={() => run("switch", p)}>
                  {busy === "switch" && <Loader2 className="animate-spin" />}
                  {p === cloud.plan && cloud.pendingPlan
                    ? `Stay on ${PLANS[p].label}`
                    : `Switch to ${PLANS[p].label}: ${formatNaira(PLANS[p].kobo)}/${PLANS[p].per}${p === "yearly" ? ` (save ${formatNaira(YEARLY_SAVING_KOBO)})` : ""}`}
                </Button>
              ))
          ) : null}
          <Button variant="outline" disabled={busy !== null} onClick={() => run("card")}>
            <CreditCard /> Update payment card
          </Button>
          {cloud.billingStatus === "non_renewing" && !cloud.pendingPlan ? (
            <Button disabled={busy !== null} onClick={() => run("resume")}>
              Keep my plan (undo cancel)
            </Button>
          ) : (
            <Button variant="ghost" className="text-destructive" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
              Cancel plan
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Switching takes effect at your next renewal date.</p>
        </section>
      )}

      {honoured && (
        <p className="rounded-2xl border bg-card p-4 text-sm">
          <BadgeCheck className="mr-1 inline size-5 text-primary" />
          You unlocked Pro with a code as an early supporter, so there&apos;s nothing to pay. Thank you!
        </p>
      )}

      {/* Before / after */}
      {!access.isPro && (
        <section aria-labelledby="see-difference">
          <h2 id="see-difference" className="text-lg font-bold">
            See the difference
          </h2>
          <p className="text-sm text-muted-foreground">The same sale, free and Pro.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <figure className="flex flex-col gap-2">
              <div className="pointer-events-none overflow-hidden rounded-xl border bg-card p-1.5 shadow-xs" aria-hidden>
                <ScaledPreview>
                  <ClassicTemplate doc={SAMPLE_RECEIPT} profile={SAMPLE_PROFILE} showFooterBrand />
                </ScaledPreview>
              </div>
              <figcaption className="text-center text-sm font-medium text-muted-foreground">Free</figcaption>
            </figure>
            <figure className="flex flex-col gap-2">
              <div className="pointer-events-none overflow-hidden rounded-xl border-2 bg-card p-1.5 shadow-md" style={{ borderColor: GOLD }} aria-hidden>
                <ScaledPreview>
                  <BoldTemplate doc={SAMPLE_RECEIPT} profile={SAMPLE_PROFILE} showFooterBrand={false} />
                </ScaledPreview>
              </div>
              <figcaption className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                <ProBadge className="px-1.5 py-0.5 text-[10px]" /> Bold template
              </figcaption>
            </figure>
          </div>
        </section>
      )}

      {/* Benefits */}
      <section aria-labelledby="whats-included" className="flex flex-col gap-3">
        <h2 id="whats-included" className="text-lg font-bold">
          {access.isPro ? "Included in your plan" : "What you get"}
        </h2>
        {PRO_BENEFITS.map((b) => (
          <div key={b.title} className="flex gap-4 rounded-2xl border bg-card p-4 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <BadgeCheck className="size-5" />
            </span>
            <div>
              <div className="font-semibold">{b.title}</div>
              <div className="text-sm text-muted-foreground">{b.text}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Comparison */}
      {!access.isPro && (
        <section aria-labelledby="compare">
          <h2 id="compare" className="text-lg font-bold">
            Free vs Pro
          </h2>
          <div className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="p-3 text-sm font-medium text-muted-foreground">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="w-[24%] p-3 text-center text-sm font-semibold">
                    Free
                  </th>
                  <th scope="col" className="w-[26%] bg-secondary/60 p-3 text-center text-sm font-bold text-primary">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {PRO_COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b last:border-b-0">
                    <th scope="row" className="p-3 text-sm font-normal">
                      {row.feature}
                    </th>
                    <td className="p-3 text-center">
                      <Cell value={row.free} />
                    </td>
                    <td className="bg-secondary/60 p-3 text-center">
                      <Cell value={row.pro} pro />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!access.isPro && <UnlockCode />}

      {/* FAQ */}
      <section aria-labelledby="faq">
        <h2 id="faq" className="text-lg font-bold">
          Questions
        </h2>
        <Accordion type="single" collapsible className="mt-2 rounded-2xl border bg-card px-4 shadow-xs">
          {FAQ.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-4" /> Your records are never deleted when your plan changes.
      </p>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel your plan?</DialogTitle>
            <DialogDescription>
              Pro stays on until {summary.detail.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? "the end of your paid period"}. After
              that you move to Free. Your records stay safe and you can upgrade again any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              size="lg"
              disabled={busy !== null}
              onClick={async () => {
                await run("cancel");
                setConfirmCancel(false);
              }}
            >
              Yes, cancel
            </Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Unlock codes from before subscriptions are still honoured. */
function UnlockCode() {
  const { access, reload } = useAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter your unlock code.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const token = access?.cloud ? await accessToken() : null;
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ code, businessId: access?.cloud?.businessId }),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) {
        setError(data.error ?? "That code didn't work. Check it and try again.");
        return;
      }
      if (!access?.cloud) await setProUnlocked();
      await reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("Welcome to InCeipt Pro!");
    } catch {
      setError("You need internet to check the code. Please connect and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section id="unlock" aria-labelledby="unlock-title" className="rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 id="unlock-title" className="font-bold">
            Have an unlock code?
          </h2>
          <p className="text-sm text-muted-foreground">Early supporters&apos; codes still work.</p>
        </div>
      </div>
      <form onSubmit={unlock} noValidate className="mt-4 flex flex-col gap-3">
        <Field id="unlock-code" label="Unlock code" error={error}>
          <Input
            id="unlock-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="e.g. INCEIPT-PRO-1234"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
            aria-invalid={!!error || undefined}
            maxLength={64}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={checking}>
          {checking && <Loader2 className="animate-spin" />}
          {checking ? "Checking…" : "Unlock Pro"}
        </Button>
      </form>
    </section>
  );
}
