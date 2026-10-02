"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addSampleData, canAddSampleData } from "@/lib/demo-data";
import { setProLocked, setProUnlocked } from "@/lib/local-db";
import { usePreviewMode } from "@/lib/preview";

const TOUR: { href: string; label: string; text: string }[] = [
  { href: "/assistant", label: "Assistant (AI)", text: "Type “Receipt for Ada, 2 trays of jollof at 85k”" },
  { href: "/tax", label: "Tax accountant", text: "Income tax, VAT, deadlines and a PDF report" },
  { href: "/history?status=owing", label: "Who owes you", text: "Part payments and balances" },
  { href: "/quotes", label: "Quotations", text: "Send quotes, turn them into invoices" },
  { href: "/expenses", label: "Expenses", text: "Log what you spend, with photos" },
  { href: "/profit", label: "Profit", text: "Sales vs expenses by month" },
  { href: "/create", label: "Pro templates", text: "Bold and Elegant, no “Made with InCeipt”" },
  { href: "/admin", label: "Admin dashboard", text: "Your view of all users (sample numbers)" },
];

export function DemoPanel() {
  const mode = usePreviewMode();
  const { access, reload } = useAccess();
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    canAddSampleData()
      .then((e) => active && setEmpty(e))
      .catch(() => active && setEmpty(false));
    return () => {
      active = false;
    };
  }, [busy]);

  if (!mode || !access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (!mode.enabled)
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        The Pro preview is only available on test (preview) links, not on the live app.
      </p>
    );
  if (access.mode === "cloud")
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        You&apos;re signed in to an account. The Pro preview works on this phone&apos;s records only: sign out in More → Account
        to use it.
      </p>
    );

  const turnOn = async (withSamples: boolean) => {
    setBusy(true);
    try {
      await setProUnlocked();
      if (withSamples) await addSampleData();
      await reload();
      toast.success(withSamples ? "Pro preview is on, with sample records." : "Pro preview is on.");
    } catch {
      toast.error("Couldn't turn on the preview. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await setProLocked();
      await reload();
      toast.success("Pro preview is off.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-dashed border-primary/40 bg-secondary p-4 text-sm">
        <FlaskConical className="size-6 shrink-0 text-primary" />
        <p>
          Test link only. This switches on every Pro feature on this phone so you can try them. It doesn&apos;t exist on the live
          app, and no payment is made.
        </p>
      </div>

      {access.isPro ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <BadgeCheck className="size-5 text-primary" /> Pro preview is on
            </div>
            {empty && (
              <Button variant="outline" disabled={busy} onClick={() => turnOn(true)}>
                {busy && <Loader2 className="animate-spin" />} Add sample records
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={turnOff}>
              Turn Pro preview off
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {empty ? (
              <>
                <Button size="lg" disabled={busy} onClick={() => turnOn(true)}>
                  {busy && <Loader2 className="animate-spin" />} Turn on Pro with sample records
                </Button>
                <p className="text-xs text-muted-foreground">
                  Adds a sample business (Mama Chi Kitchen) with receipts, invoices, quotes and expenses from the last 5 months.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">You already have records on this phone, so they&apos;ll be used.</p>
            )}
            <Button variant={empty ? "outline" : "default"} size="lg" disabled={busy} onClick={() => turnOn(false)}>
              Turn on Pro{empty ? " without samples" : ""}
            </Button>
          </CardContent>
        </Card>
      )}

      {access.isPro && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Try the Pro features</h2>
          {TOUR.map((t) => (
            <Link key={t.href} href={t.href} className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs active:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-sm text-muted-foreground">
                  {t.href === "/assistant" && !mode.assistantReady ? "Needs ANTHROPIC_API_KEY in Vercel (Preview)" : t.text}
                </span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          ))}
          <p className="text-xs text-muted-foreground">
            Staff accounts and Pay Now links need Supabase and Paystack keys, so they can&apos;t be previewed on this phone alone.
          </p>
        </section>
      )}
    </div>
  );
}
