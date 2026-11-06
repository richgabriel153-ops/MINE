"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, ClipboardList, FileText, ImagePlus, Lock, ReceiptText } from "lucide-react";

import { ProLock, useAccess } from "@/components/access/access-provider";
import { Signboard } from "@/components/brand/signboard";
import { DocumentCard } from "@/components/history/document-card";
import { InstallButton } from "@/components/pwa/install-button";
import { useCountUp } from "@/hooks/use-count-up";
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

  const name = profile?.name || "Your business";
  const week = useCountUp(summary ? summary.weekKobo : null);
  const canQuote = access?.can.quotes ?? false;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <Signboard>
        <div className="flex items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-white text-lg font-extrabold text-ink">
            {profile?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the seller's own logo (data: URL)
              <img src={profile.logo} alt="" className="size-full object-contain p-1" />
            ) : (
              <span aria-hidden className="flex size-full items-center justify-center bg-highlight">
                {initials(name)}
              </span>
            )}
          </span>
          <h1 className="min-w-0 flex-1 text-[1.6rem] leading-[1.1] font-extrabold tracking-[-0.01em] break-words text-balance">{name}</h1>
        </div>

        {summary && owner && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/25 pt-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-on-sign-muted">In this week</div>
              <div className="amount text-[clamp(1.15rem,6.2vw,1.65rem)] leading-tight font-extrabold">{formatNaira(week ?? 0)}</div>
              <div className="amount mt-0.5 text-xs text-on-sign-muted">Month: {formatNaira(summary.monthKobo)}</div>
            </div>
            {canTrackDebts ? (
              <Link href="/history?status=owing" className="press -m-2 min-w-0 rounded-xl p-2 active:bg-white/10">
                <div className="text-sm font-semibold text-on-sign-muted">Owed to you</div>
                <div className={`amount text-[clamp(1.15rem,6.2vw,1.65rem)] leading-tight font-extrabold ${summary.owingKobo > 0 ? "text-on-sign-warm" : ""}`}>
                  {formatNaira(summary.owingKobo)}
                </div>
                <div className="mt-0.5 flex items-center text-xs text-on-sign-muted">
                  {summary.owingCount === 0 ? "All paid" : `${summary.owingCount} unpaid`} <ChevronRight className="size-3.5" aria-hidden />
                </div>
              </Link>
            ) : (
              <button type="button" onClick={() => showUpgrade("Debt tracking")} className="press -m-2 min-w-0 cursor-pointer rounded-xl p-2 text-left active:bg-white/10">
                <div className="flex items-center gap-1 text-sm font-semibold text-on-sign-muted">
                  Owed to you <Lock className="size-3.5" aria-hidden />
                </div>
                <div className="mt-1 text-sm font-semibold">See who owes you with Pro</div>
              </button>
            )}
          </div>
        )}
      </Signboard>

      <div className="flex flex-col gap-2">
        <Link
          href="/create"
          className="press flex h-16 items-center justify-center gap-2.5 rounded-2xl border-2 border-ink bg-highlight text-lg font-extrabold text-ink active:bg-[#d65f2c]"
        >
          <ReceiptText className="size-6" aria-hidden /> New receipt
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/create?type=invoice"
            className="press flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink/85 bg-card font-bold active:bg-muted"
          >
            <FileText className="size-5" aria-hidden /> Invoice
          </Link>
          {canQuote ? (
            <Link
              href="/create?type=quote"
              className="press flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink/85 bg-card font-bold active:bg-muted"
            >
              <ClipboardList className="size-5" aria-hidden /> Quote
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => showUpgrade("Quotations")}
              className="press flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-ink/85 bg-card font-bold active:bg-muted"
            >
              <ClipboardList className="size-5" aria-hidden /> Quote <ProLock />
            </button>
          )}
        </div>
      </div>

      {profile && owner && (!profile.name || !profile.logo || !hasBankDetails(profile)) && (
        <Link
          href="/profile?next=/home"
          className="press flex items-center gap-3 rounded-2xl border-2 border-dashed border-primary/50 bg-card p-4 text-sm active:bg-muted"
        >
          <ImagePlus className="size-6 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong className="block">{profile.name ? "Put your brand on every receipt" : "Start here: add your business details"}</strong>
            <span className="text-muted-foreground">
              Add your {[!profile.logo && "logo", !hasBankDetails(profile) && "bank details", !profile.name && "business name"].filter(Boolean).join(" and ")}.
            </span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      )}

      {loadError && (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-card p-4 text-sm">
          Couldn&apos;t load your records. Check your internet connection and pull down to refresh.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between px-1 pt-2">
          <h2 className="text-lg font-extrabold">Recent sales</h2>
          {(recent?.length ?? 0) > 0 && (
            <Link href="/history" className="flex min-h-11 items-center text-sm font-bold text-primary">
              See all
            </Link>
          )}
        </div>
        {docs === null ? (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex h-[4.25rem] items-center gap-3 px-4">
                <span className="h-4 flex-1 animate-pulse rounded bg-muted" />
                <span className="h-4 w-20 animate-pulse rounded bg-muted" />
              </li>
            ))}
          </ul>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-card p-6 text-center">
            <ReceiptText className="size-8 text-primary" aria-hidden />
            <p className="font-bold">No sales yet</p>
            <p className="text-sm text-muted-foreground">Tap New receipt when your next customer pays. It takes less than a minute.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {docs.map((d) => (
              <li key={d.id}>
                <DocumentCard doc={d} variant="row" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <InstallButton className="w-full" />

      {access && !access.isPro && (
        <Link href="/pro" className="press flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm active:bg-muted">
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
