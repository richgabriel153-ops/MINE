"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Segmented } from "@/components/form/segmented";
import { DocumentActions } from "@/components/history/document-actions";
import { DocumentCard } from "@/components/history/document-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDocuments } from "@/hooks/use-documents";
import { ProLock, useAccess } from "@/components/access/access-provider";
import { filterDocuments, monthLabel, type StatusFilter, type TypeFilter } from "@/lib/history-filter";
import { formatNaira } from "@/lib/money";
import { FREE_HISTORY_LIMIT } from "@/lib/pro";
import { owingKobo } from "@/lib/summary";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/lib/types";

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "owing", label: "Owing" },
  { value: "paid", label: "Paid" },
  { value: "part", label: "Part paid" },
  { value: "unpaid", label: "Unpaid" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "receipt", label: "Receipts" },
  { value: "invoice", label: "Invoices" },
] as const satisfies readonly { value: TypeFilter; label: string }[];

function readStatus(v: string | null): StatusFilter {
  return STATUS_CHIPS.some((c) => c.value === v) ? (v as StatusFilter) : "all";
}

function readType(v: string | null): TypeFilter {
  return v === "receipt" || v === "invoice" ? v : "all";
}

/** Group documents by month of their date (they arrive newest first). */
function groupByMonth(docs: DocumentRecord[]) {
  const sorted = [...docs].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt.localeCompare(a.createdAt));
  const groups: { key: string; label: string; docs: DocumentRecord[] }[] = [];
  for (const doc of sorted) {
    const key = doc.issueDate.slice(0, 7);
    const last = groups.at(-1);
    if (last?.key === key) last.docs.push(doc);
    else groups.push({ key, label: monthLabel(doc.issueDate), docs: [doc] });
  }
  return groups;
}

export function HistoryList() {
  const { docs: allDocs, reload } = useDocuments();
  const { access, showUpgrade } = useAccess();
  const canTrackDebts = access?.can.trackDebts ?? false;
  // Free version shows the newest FREE_HISTORY_LIMIT documents; the rest stay saved and in backups.
  const limited = access !== null && !access.can.unlimitedHistory && allDocs !== null && allDocs.length > FREE_HISTORY_LIMIT;
  const docs = useMemo(
    () => (allDocs && access !== null ? (limited ? allDocs.slice(0, FREE_HISTORY_LIMIT) : allDocs) : null),
    [allDocs, access, limited],
  );
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const requestedStatus = readStatus(params.get("status"));
  const status: StatusFilter = requestedStatus === "owing" && !canTrackDebts ? "all" : requestedStatus;
  const type = readType(params.get("type"));

  // Filters live in the address, so Back returns to the same view.
  function setParam(key: string, value: string, fallback: string) {
    const next = new URLSearchParams(params.toString());
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => (docs ? filterDocuments(docs, { query, status, type }) : []), [docs, query, status, type]);
  const groups = useMemo(() => groupByMonth(filtered), [filtered]);
  const owingTotal = useMemo(() => filtered.reduce((sum, d) => sum + owingKobo(d), 0), [filtered]);
  const filtering = query !== "" || status !== "all" || type !== "all";

  if (docs === null) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  if (docs.length === 0)
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No receipts or invoices yet.</p>
        <Button asChild>
          <Link href="/create">Create a receipt</Link>
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          placeholder="Search name, number, phone or item"
          aria-label="Search"
          className="pr-11 pl-10"
          defaultValue={query}
          onChange={(e) => setParam("q", e.target.value, "")}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground"
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector("input");
              if (input) input.value = "";
              setParam("q", "", "");
            }}
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <Segmented label="Type" value={type} onChange={(v) => setParam("type", v, "all")} options={TYPE_OPTIONS} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Payment status">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={status === c.value}
            onClick={() =>
              c.value === "owing" && !canTrackDebts ? showUpgrade("Debt tracking") : setParam("status", c.value, "all")
            }
            className={cn(
              "h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium whitespace-nowrap",
              status === c.value ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            <span className="inline-flex items-center gap-1">
              {c.label}
              {c.value === "owing" && !canTrackDebts && <ProLock />}
            </span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "result" : "results"}
        {canTrackDebts && owingTotal > 0 && (status === "owing" || status === "unpaid" || status === "part") && (
          <> · {formatNaira(owingTotal)} owed</>
        )}
      </p>

      {limited && (
        <Link href="/pro" className="rounded-xl border border-highlight/50 bg-highlight/10 p-3 text-sm text-[#5a4210]">
          Showing your latest {FREE_HISTORY_LIMIT} of {allDocs?.length} records. Older ones are safe on this phone and in
          your backups. <span className="font-semibold underline">Go Pro to see them all.</span>
        </Link>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Nothing matches.</p>
          {filtering && (
            <Button variant="outline" onClick={() => router.replace(pathname, { scroll: false })}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <h2 className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-1 text-sm font-semibold text-muted-foreground backdrop-blur md:top-14">
              {g.label}
            </h2>
            <ul className="flex flex-col gap-2">
              {g.docs.map((d) => (
                <li key={d.id}>
                  <DocumentCard doc={d} actions={<DocumentActions doc={d} onChanged={reload} />} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
