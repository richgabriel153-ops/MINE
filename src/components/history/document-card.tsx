import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { STATUS_COLOUR, STATUS_LABEL } from "@/components/templates/shared";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { owingKobo } from "@/lib/summary";
import { computeTotals } from "@/lib/totals";
import type { DocumentRecord } from "@/lib/types";

export function DocumentCard({ doc, actions }: { doc: DocumentRecord; actions?: React.ReactNode }) {
  const totals = computeTotals(doc);
  const owing = owingKobo(doc);
  return (
    <div className="flex items-center rounded-xl border bg-card shadow-xs">
      <Link
        href={`/view?id=${doc.id}`}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-4 transition-colors active:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{doc.number}</span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
              style={{ color: STATUS_COLOUR[doc.status], backgroundColor: `${STATUS_COLOUR[doc.status]}18` }}
            >
              {STATUS_LABEL[doc.status]}
            </span>
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.customer.name || (doc.type === "invoice" ? "Invoice" : "Receipt")} · {formatDate(doc.issueDate)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{formatNaira(totals.totalKobo)}</div>
          {doc.status === "part" && owing > 0 && (
            <div className="text-xs text-warning tabular-nums">Bal. {formatNaira(owing)}</div>
          )}
          {doc.receiptId && <div className="text-xs text-muted-foreground">Receipt made</div>}
        </div>
        {!actions && <ChevronRight className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden />}
      </Link>
      {actions}
    </div>
  );
}
