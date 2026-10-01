"use client";

import Link from "next/link";
import { FileText, ReceiptText } from "lucide-react";

import { DocumentCard } from "@/components/history/document-card";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/hooks/use-documents";
import { useProfile } from "@/hooks/use-profile";

export function HomeDashboard() {
  const [profile] = useProfile();
  const { docs } = useDocuments();
  const recent = docs?.slice(0, 5) ?? [];

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
    </div>
  );
}
