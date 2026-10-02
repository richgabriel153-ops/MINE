"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Button } from "@/components/ui/button";
import { lagosDate, formatDate } from "@/lib/dates";
import { convertQuote, setQuoteStatus } from "@/lib/db";
import { QUOTE_STATUS_LABEL, quoteStatus } from "@/lib/quotes";
import type { DocumentRecord, QuoteStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHOICES: QuoteStatus[] = ["draft", "sent", "accepted", "declined"];

/** Status and "Convert to invoice" for a quotation. */
export function QuotePanel({ doc, onChange }: { doc: DocumentRecord; onChange: (d: DocumentRecord) => void }) {
  const router = useRouter();
  const { requirePro } = useAccess();
  const [busy, setBusy] = useState<string | null>(null);
  const today = lagosDate();
  const shown = quoteStatus(doc, today);

  async function changeStatus(s: QuoteStatus) {
    if (!requirePro("Quotations")) return;
    setBusy(s);
    try {
      onChange(await setQuoteStatus(doc.id, s));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the quote.");
    } finally {
      setBusy(null);
    }
  }

  async function convert() {
    if (!requirePro("Quotations")) return;
    setBusy("convert");
    try {
      const invoice = await convertQuote(doc.id, today);
      toast.success(`${invoice.number} created from ${doc.number}`);
      router.push(`/view?id=${invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't make the invoice.");
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Quote status</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold",
            shown === "expired" || shown === "declined" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
          )}
        >
          {QUOTE_STATUS_LABEL[shown]}
        </span>
      </div>
      {doc.dueDate && shown !== "converted" && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {shown === "expired" ? "Expired on" : "Valid until"} {formatDate(doc.dueDate)}
        </p>
      )}
      {doc.invoiceId ? (
        <p className="text-sm">
          Turned into invoice{" "}
          <Link className="font-semibold text-primary underline" href={`/view?id=${doc.invoiceId}`}>
            {doc.invoiceNumber}
          </Link>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Quote status">
            {CHOICES.map((s) => {
              const selected = (doc.quoteStatus ?? "draft") === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy !== null}
                  onClick={() => !selected && changeStatus(s)}
                  className={cn(
                    "h-10 cursor-pointer rounded-lg text-xs font-semibold text-muted-foreground",
                    selected && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {busy === s ? <Loader2 className="mx-auto size-4 animate-spin" /> : QUOTE_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
          <Button size="lg" onClick={convert} disabled={busy !== null}>
            {busy === "convert" ? <Loader2 className="animate-spin" /> : <FileCheck2 />} Convert to invoice
          </Button>
          <p className="text-xs text-muted-foreground">Copies the customer, items, prices, discount, VAT and notes into a new invoice.</p>
        </>
      )}
    </section>
  );
}
