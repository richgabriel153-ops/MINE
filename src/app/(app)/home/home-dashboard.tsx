"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, FileText, ReceiptText } from "lucide-react";

import { ProLock, useAccess } from "@/components/access/access-provider";
import { DocumentCard } from "@/components/history/document-card";
import { InstallButton } from "@/components/pwa/install-button";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { lagosDate } from "@/lib/dates";
import { getBusinessSummary, listDocumentsPage, type BusinessSummary } from "@/lib/db";
import { formatNaira } from "@/lib/money";
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

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-5">
        <p className="text-sm text-muted-foreground">Welcome{profile?.name ? " back" : ""}</p>
        <h1 className="text-2xl font-bold tracking-tight">{profile?.name || "InCeipt"}</h1>
      </header>

      {profile && !profile.name && (
        <div className="rounded-xl border border-primary/30 bg-secondary p-4 text-sm">
          <p className="mb-3">
            <strong>Start here:</strong> add your business name, logo and bank details. They&apos;ll appear on every
            receipt.
          </p>
          <Button asChild size="sm">
            <Link href="/profile?next=/home">Add business details</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/create"
          className="flex flex-col gap-2 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm active:scale-[0.98]"
        >
          <ReceiptText className="size-7" />
          <span className="text-base font-semibold">New receipt</span>
          <span className="text-xs opacity-85">Customer has paid</span>
        </Link>
        <Link
          href="/create?type=invoice"
          className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs active:scale-[0.98]"
        >
          <FileText className="size-7 text-primary" />
          <span className="text-base font-semibold">New invoice</span>
          <span className="text-xs text-muted-foreground">Ask for payment</span>
        </Link>
      </div>

      {summary && docs && docs.length > 0 && owner && (
        <section aria-label="Summary" className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border bg-card p-4 shadow-xs">
            <div className="text-xs text-muted-foreground">Sales this week</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{formatNaira(summary.weekKobo)}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-xs">
            <div className="text-xs text-muted-foreground">Sales this month</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{formatNaira(summary.monthKobo)}</div>
          </div>
          {canTrackDebts ? (
          <Link
              href="/history?status=owing"
              className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs active:bg-muted"
            >
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Customers owe you</div>
                <div className={`mt-1 text-xl font-bold tabular-nums ${summary.owingKobo > 0 ? "text-warning" : ""}`}>
                  {formatNaira(summary.owingKobo)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {summary.owingCount === 0
                    ? "Nothing outstanding"
                    : `${summary.owingCount} unpaid or part-paid ${summary.owingCount === 1 ? "document" : "documents"}`}
                </div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => showUpgrade("Debt tracking")}
              className="col-span-2 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed bg-card p-4 text-left shadow-xs"
            >
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Customers owe you <ProLock />
                </div>
                <div className="mt-1 text-sm font-medium">See who owes you money and record part payments with Pro.</div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </button>
          )}
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
            Sales = money received, on the day it was paid. Weeks start on Monday.
          </p>
        </section>
      )}

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
          <p className="text-sm text-muted-foreground">Loading…</p>
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
        <Link href="/pro" className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow-xs">
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
