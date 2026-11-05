"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, FileText, ImagePlus, ReceiptText } from "lucide-react";

import { ProLock, useAccess } from "@/components/access/access-provider";
import { DocumentCard } from "@/components/history/document-card";
import { InstallButton } from "@/components/pwa/install-button";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { lagosDate } from "@/lib/dates";
import { getBusinessSummary, listDocumentsPage, type BusinessSummary } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { hasBankDetails } from "@/lib/profile";
import type { DocumentRecord } from "@/lib/types";

export function HomeDashboard() {
  const [profile] = useProfile();
  const { access, showUpgrade } = useAccess();
  const canTrackDebts = access?.can.trackDebts ?? false;
  const [recent, setRecent] = useState<DocumentRecord[] | null>(null);
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const owner = access?.can.viewRevenue ?? false;

  useEffect(() => {
    if (!access) return;
    let active = true;
    Promise.all([
      listDocumentsPage({ type: "all", offset: 0, limit: 5 }),
      owner ? getBusinessSummary(lagosDate()) : Promise.resolve(null),
    ])
      .then(([page, s]) => {
        if (!active) return;
        setRecent(page.docs);
        setSummary(s);
      })
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [access, owner]);
  const docs = recent;

  const name = profile?.name || "InCeipt";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3 pt-5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-highlight text-base font-bold text-[#0e1d1c]"
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Welcome{profile?.name ? " back" : ""}</p>
          <h1 className="truncate text-xl leading-tight font-bold">{name}</h1>
        </div>
      </header>

      {profile && owner && (!profile.name || !profile.logo || !hasBankDetails(profile)) && (
        <Link
          href="/profile?next=/home"
          className="press flex items-center gap-3 rounded-xl border border-primary/30 bg-secondary p-4 text-sm active:bg-accent"
        >
          <ImagePlus className="size-6 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong className="block">{profile.name ? "Finish your business details" : "Start here: add your business details"}</strong>
            <span className="text-muted-foreground">
              Add your {[!profile.logo && "logo", !hasBankDetails(profile) && "bank details", !profile.name && "business name"].filter(Boolean).join(" and ")}{" "}
              so they print on every receipt and invoice.
            </span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      )}

      {summary && owner && (
        <section aria-label="Money" className="flex flex-col gap-2">
          <div className="rounded-2xl bg-secondary p-4">
            <div className="text-sm font-semibold text-muted-foreground">Money in this week</div>
            <div className="amount mt-1 text-[2rem] leading-tight font-bold">{formatNaira(summary.weekKobo)}</div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">This month</span>
              <span className="amount font-bold">{formatNaira(summary.monthKobo)}</span>
            </div>
          </div>
          {canTrackDebts ? (
            <Link
              href="/history?status=owing"
              className="press flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 active:bg-muted"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Customers owe you</div>
                <div className="text-sm text-muted-foreground">
                  {summary.owingCount === 0
                    ? "Nothing outstanding"
                    : `${summary.owingCount} unpaid or part paid`}
                </div>
              </div>
              <span className={`amount font-bold ${summary.owingKobo > 0 ? "text-destructive" : ""}`}>
                {formatNaira(summary.owingKobo)}
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => showUpgrade("Debt tracking")}
              className="press flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  Customers owe you <ProLock />
                </div>
                <div className="text-sm text-muted-foreground">See who owes you and record part payments with Pro.</div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </button>
          )}
          <p className="text-xs text-muted-foreground">Money in = payments received, on the day they were paid. Weeks start on Monday.</p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-14">
          <Link href="/create">
            <ReceiptText /> Receipt
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-14 border-foreground/80">
          <Link href="/create?type=invoice">
            <FileText /> Invoice
          </Link>
        </Button>
      </div>

      {loadError && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Couldn&apos;t load your records. Check your internet connection and pull down to refresh.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent</h2>
          {(recent?.length ?? 0) > 0 && (
            <Link href="/history" className="text-sm font-medium text-primary">
              See all
            </Link>
          )}
        </div>
        {docs === null ? (
          <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
            ))}
          </ul>
        ) : docs.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Your receipts and invoices will show here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id}>
                <DocumentCard doc={d} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <InstallButton className="w-full" />

      {access && !access.isPro && (
        <Link href="/pro" className="press flex items-center gap-3 rounded-xl border bg-card p-4 text-sm active:bg-muted">
          <BadgeCheck className="size-6 shrink-0 text-primary" />
          <span className="flex-1">
            <strong>Go Pro:</strong> remove the InCeipt footer, get 2 extra templates and unlimited history.
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Up to two initials for the business mark, e.g. "Mama Chi Kitchen" -> "MC". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? "");
  return letters.join("").toUpperCase() || "IN";
}
