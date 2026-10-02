"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Plus } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/hooks/use-documents";
import { formatDate, lagosDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { QUOTE_STATUS_LABEL, quoteStatus, type QuoteDisplayStatus } from "@/lib/quotes";
import { computeTotals } from "@/lib/totals";
import { cn } from "@/lib/utils";

const FILTERS: ("all" | QuoteDisplayStatus)[] = ["all", "draft", "sent", "accepted", "declined", "expired", "converted"];

export function QuotesList() {
  const { access, showUpgrade } = useAccess();
  const { docs } = useDocuments();
  const [filter, setFilter] = useState<"all" | QuoteDisplayStatus>("all");
  const today = lagosDate();
  const quotes = useMemo(() => (docs ?? []).filter((d) => d.type === "quote").map((d) => ({ doc: d, status: quoteStatus(d, today) })), [docs, today]);
  const shown = filter === "all" ? quotes : quotes.filter((q) => q.status === filter);

  if (!access || docs === null) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  const newButton = access.can.quotes ? (
    <Button asChild size="lg">
      <Link href="/create?type=quote">
        <Plus /> New quote
      </Link>
    </Button>
  ) : (
    <Button size="lg" onClick={() => showUpgrade("Quotations")}>
      <Plus /> New quote
    </Button>
  );

  if (quotes.length === 0)
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
        <FileText className="size-10 text-muted-foreground" />
        <p className="text-muted-foreground">
          Send customers a quotation or proforma invoice with your logo and prices. When they agree, turn it into an invoice in one
          tap.
        </p>
        {newButton}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {newButton}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium whitespace-nowrap",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {f === "all" ? "All" : QUOTE_STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(({ doc, status }) => (
            <li key={doc.id}>
              <Link href={`/view?id=${doc.id}`} className="flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs active:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{doc.number}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                        status === "expired" || status === "declined" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {QUOTE_STATUS_LABEL[status]}
                    </span>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {doc.customer.name || (doc.quoteTitle === "proforma" ? "Proforma invoice" : "Quotation")} · {formatDate(doc.issueDate)}
                  </div>
                </div>
                <div className="font-semibold tabular-nums">{formatNaira(computeTotals(doc).totalKobo)}</div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
