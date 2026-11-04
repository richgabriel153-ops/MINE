import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { STATUS_COLOUR, STATUS_LABEL } from "@/components/templates/shared";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { owingKobo } from "@/lib/summary";
import { computeTotals } from "@/lib/totals";
import type { DocumentRecord } from "@/lib/types";

const TYPE_NAME = { receipt: "Receipt", invoice: "Invoice", quote: "Quote" } as const;

/** One record in a list: who, which number and when on the left; amount and payment status on the right. */
export function DocumentCard({ doc, actions }: { doc: DocumentRecord; actions?: React.ReactNode }) {
  const totals = computeTotals(doc);
  const owing = owingKobo(doc);
  const colour = STATUS_COLOUR[doc.status];
  const showStatus = doc.type !== "quote";
  return (
    <div className="flex items-center rounded-xl border bg-card">
      <Link
        href={`/view?id=${doc.id}`}
        className="press flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-4 active:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{doc.customer.name || TYPE_NAME[doc.type]}</div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.number} · {formatDate(doc.issueDate)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="amount font-bold">{formatNaira(totals.totalKobo)}</div>
          {showStatus && (
            <span
              className="rounded px-1.5 py-0.5 text-[11px] leading-none font-bold tracking-wide"
              style={{ color: colour, backgroundColor: `${colour}14` }}
            >
              {STATUS_LABEL[doc.status]}
            </span>
          )}
          {doc.status === "part" && owing > 0 && (
            <div className="amount text-xs font-semibold text-destructive">Bal. {formatNaira(owing)}</div>
          )}
          {doc.receiptId && <div className="text-xs text-muted-foreground">Receipt made</div>}
        </div>
        {!actions && <ChevronRight className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden />}
      </Link>
      {actions}
    </div>
  );
}
