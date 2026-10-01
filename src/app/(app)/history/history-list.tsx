"use client";

import Link from "next/link";

import { DocumentCard } from "@/components/history/document-card";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/hooks/use-documents";

// Simple list for now. Search, filters and actions come in stage 3.
export function HistoryList() {
  const { docs } = useDocuments();
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
    <ul className="flex flex-col gap-2">
      {docs.map((d) => (
        <li key={d.id}>
          <DocumentCard doc={d} />
        </li>
      ))}
    </ul>
  );
}
