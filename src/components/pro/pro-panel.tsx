"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, KeyRound, Loader2, Lock, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { BoldTemplate } from "@/components/templates/bold";
import { ClassicTemplate } from "@/components/templates/classic";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePro } from "@/hooks/use-pro";
import { formatDate, lagosDate } from "@/lib/dates";
import { setProUnlocked } from "@/lib/db";
import { paymentLink, priceLabel, PRO_BENEFITS, PRO_COMPARISON } from "@/lib/pro";
import { SAMPLE_PROFILE, SAMPLE_RECEIPT } from "@/lib/sample";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const GOLD = BRAND.amber;

const FAQ = [
  {
    q: "How do I get my unlock code?",
    a: "After you pay on the secure Paystack page, you'll receive your unlock code. Type it in the “Already paid?” box on this page and Pro switches on straight away.",
  },
  {
    q: "Will I lose my receipts when I upgrade?",
    a: "No. Everything you've already made stays exactly where it is. Pro simply unlocks more.",
  },
  {
    q: "What if I change my phone?",
    a: "Restore your backup on the new phone, then enter the same unlock code again on this page.",
  },
  {
    q: "Is my payment safe?",
    a: "Yes. Payment is handled by Paystack, a licensed payment company used by thousands of Nigerian businesses. InCeipt never sees your card details.",
  },
] as const;

function Cell({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (value === true)
    return (
      <Check className={cn("mx-auto size-5", pro ? "text-primary" : "text-muted-foreground")} aria-label="Included" />
    );
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

export function ProPanel() {
  const [pro, setPro] = usePro();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const link = paymentLink();
  const price = priceLabel();

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the code you received after paying.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) {
        setError(data.error ?? "That code didn't work. Check it and try again.");
        return;
      }
      setPro(await setProUnlocked());
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("Welcome to InCeipt Pro!");
    } catch {
      setError("You need internet to check the code. Please connect and try again.");
    } finally {
      setChecking(false);
    }
  }

  if (pro === null) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  /* ---------- Already Pro ---------- */
  if (pro.unlocked) {
    return (
      <div className="flex flex-col gap-5">
        <section className="relative overflow-hidden rounded-3xl bg-[#1c1e33] p-6 text-white shadow-lg">
          <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/40 blur-3xl" />
          <ProBadge />
          <h2 className="mt-4 text-2xl leading-tight font-bold">You&apos;re on InCeipt Pro</h2>
          <p className="mt-1 text-white/75">
            Thank you for supporting InCeipt.
            {pro.unlockedAt && ` Active since ${formatDate(lagosDate(new Date(pro.unlockedAt)))}.`}
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {PRO_BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <BadgeCheck className="mt-0.5 size-5 shrink-0" style={{ color: GOLD }} />
                <span>
                  <span className="font-semibold">{b.title}</span>
                  <span className="block text-sm text-white/70">{b.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <Button asChild size="lg">
          <Link href="/create">
            Try a Pro template <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  }

  /* ---------- Not Pro yet ---------- */
  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-[#1c1e33] px-5 pt-6 pb-7 text-white shadow-lg">
        <div className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-48 rounded-full blur-3xl" style={{ backgroundColor: `${GOLD}33` }} />
        <div className="relative">
          <ProBadge />
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-extrabold tracking-tight">
            Look like a big brand on every receipt
          </h2>
          <p className="mt-2 text-white/75">
            Remove our name, unlock premium designs and keep every record at your fingertips.
          </p>
          {price && (
            <p className="mt-5 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">{price}</span>
            </p>
          )}
          {link ? (
            <Button
              asChild
              size="lg"
              className="mt-5 h-14 w-full text-base font-bold text-[#33250a] hover:opacity-95"
              style={{ backgroundColor: GOLD }}
            >
              <a href={link} target="_blank" rel="noopener noreferrer">
                Upgrade to Pro <ArrowRight />
              </a>
            </Button>
          ) : (
            <p className="mt-5 rounded-xl bg-white/10 p-3 text-sm text-white/80">
              Upgrading isn&apos;t open yet. Please check back soon.
            </p>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/60">
            <Lock className="size-3.5" /> Secure payment by Paystack · Card, transfer or USSD
          </p>
        </div>
      </section>

      {/* Before / after */}
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
            <div
              className="pointer-events-none overflow-hidden rounded-xl border-2 bg-card p-1.5 shadow-md"
              style={{ borderColor: GOLD }}
              aria-hidden
            >
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

      {/* Benefits */}
      <section aria-labelledby="whats-included" className="flex flex-col gap-3">
        <h2 id="whats-included" className="text-lg font-bold">
          What you get
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

      {/* Unlock */}
      <section id="unlock" aria-labelledby="unlock-title" className="rounded-2xl border bg-card p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <KeyRound className="size-5" />
          </span>
          <div>
            <h2 id="unlock-title" className="font-bold">
              Already paid?
            </h2>
            <p className="text-sm text-muted-foreground">Enter your unlock code to switch on Pro.</p>
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
          <Button type="submit" variant="default" disabled={checking}>
            {checking && <Loader2 className="animate-spin" />}
            {checking ? "Checking…" : "Unlock Pro"}
          </Button>
        </form>
      </section>

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
        <ShieldCheck className="size-4" /> Your receipts stay on your phone. Upgrading never touches your records.
      </p>
    </div>
  );
}
