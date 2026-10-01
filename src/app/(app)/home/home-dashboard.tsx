"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, FileText, ReceiptText, ShieldCheck } from "lucide-react";

import { DocumentCard } from "@/components/history/document-card";
import { InstallButton } from "@/components/pwa/install-button";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/hooks/use-documents";
import { usePro } from "@/hooks/use-pro";
import { useProfile } from "@/hooks/use-profile";
import { lagosDate } from "@/lib/dates";
import { getSettings } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { summarise } from "@/lib/summary";

/** Remind people to back up once they have some records and haven't for a while. */
const BACKUP_REMINDER_AFTER_DOCS = 10;
const BACKUP_REMINDER_DAYS = 14;

export function HomeDashboard() {
  const [profile] = useProfile();
  const { docs } = useDocuments();
  const [pro] = usePro();
  const recent = docs?.slice(0, 5) ?? [];
  const summary = useMemo(() => (docs ? summarise(docs, lagosDate()) : null), [docs]);
  const [backupStale, setBackupStale] = useState(false);
  useEffect(() => {
    getSettings().then((s) =>
      setBackupStale(!s.lastBackupAt || Date.now() - Date.parse(s.lastBackupAt) > BACKUP_REMINDER_DAYS * 86_400_000),
    );
  }, []);
  const needsBackup = backupStale && docs !== null && docs.length >= BACKUP_REMINDER_AFTER_DOCS;

  return (
    <div className="flex flex-col gap-6">
      <header className="pt-5">
        <p className="text-sm text-muted-foreground">Welcome{profile?.name ? " back" : ""}</p>
        <h1 className="text-2xl font-bold tracking-tight">{profile?.name || "ReceiptNaija"}</h1>
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

      {summary && docs && docs.length > 0 && (
        <section aria-label="Summary" className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border bg-card p-4 shadow-xs">
            <div className="text-xs text-muted-foreground">Sales this week</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{formatNaira(summary.weekKobo)}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-xs">
            <div className="text-xs text-muted-foreground">Sales this month</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{formatNaira(summary.monthKobo)}</div>
          </div>
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
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
            Sales = money received, by receipt date. Weeks start on Monday.
          </p>
        </section>
      )}

      {needsBackup && (
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <ShieldCheck className="size-6 shrink-0 text-warning" />
          <span className="flex-1">
            <strong>Back up your records.</strong> Your receipts are only on this phone. Save a backup so you
            don&apos;t lose them.
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent</h2>
          {recent.length > 0 && (
            <Link href="/history" className="text-sm font-medium text-primary">
              See all
            </Link>
          )}
        </div>
        {docs === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Your receipts and invoices will show here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((d) => (
              <li key={d.id}>
                <DocumentCard doc={d} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <InstallButton className="w-full" />

      {pro && !pro.unlocked && (
        <Link href="/pro" className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow-xs">
          <BadgeCheck className="size-6 shrink-0 text-primary" />
          <span className="flex-1">
            <strong>Go Pro:</strong> remove the ReceiptNaija footer, get 2 extra templates and unlimited history.
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      )}
    </div>
  );
}
