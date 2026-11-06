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
export function DocumentCard({ doc, actions, variant = "card" }: { doc: DocumentRecord; actions?: React.ReactNode; variant?: "card" | "row" }) {
  const totals = computeTotals(doc);
  const owing = owingKobo(doc);
  const colour = STATUS_COLOUR[doc.status];
  const showStatus = doc.type !== "quote";
  return (
    <div className={variant === "card" ? "flex items-center rounded-2xl border bg-card" : "flex items-center"}>
      <Link
        href={`/view?id=${doc.id}`}
        className="press flex min-h-[4.25rem] min-w-0 flex-1 items-center gap-3 rounded-2xl py-3 pl-4 active:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{doc.customer.name || TYPE_NAME[doc.type]}</div>
          <div className="truncate text-sm text-muted-foreground">
            {doc.number} · {formatDate(doc.issueDate)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="amount text-[1.05rem] font-extrabold">{formatNaira(totals.totalKobo)}</div>
          {showStatus && <Stamp colour={colour}>{STATUS_LABEL[doc.status]}</Stamp>}
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

/** A bold rubber-stamp label for payment status. */
export function Stamp({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-[5px] border-[1.5px] px-1.5 py-[3px] text-[10.5px] leading-none font-extrabold tracking-[0.06em] uppercase"
      style={{ color: colour, borderColor: colour, backgroundColor: `${colour}12` }}
    >
      {children}
    </span>
  );
}
