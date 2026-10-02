"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lagosDate } from "@/lib/dates";
import { markInvoicePaid } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { owingKobo } from "@/lib/summary";
import { computeTotals } from "@/lib/totals";
import type { DocumentRecord, PaymentMethod } from "@/lib/types";

const METHODS = [
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
] as const satisfies readonly { value: PaymentMethod; label: string }[];

/** Can this document be marked as paid (turned into a receipt)? */
export function canMarkPaid(doc: DocumentRecord): boolean {
  return doc.type === "invoice" && !doc.receiptId;
}

export function MarkPaidDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: DocumentRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>(doc.method);
  const [saving, setSaving] = useState(false);
  const total = computeTotals(doc).totalKobo;
  const owing = owingKobo(doc);

  async function confirm() {
    setSaving(true);
    try {
      const receipt = await markInvoicePaid(doc.id, method, lagosDate());
      toast.success(`${doc.number} paid. Receipt ${receipt.number} created.`);
      onOpenChange(false);
      router.push(`/view?id=${receipt.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark as paid. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {doc.number} as paid?</DialogTitle>
          <DialogDescription>
            We&apos;ll make a receipt for {formatNaira(total)} dated today, ready to send to your customer.
            {owing !== total && owing > 0 && ` (They still owed ${formatNaira(owing)}.)`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">How did they pay?</span>
          <Segmented label="Payment method" value={method} onChange={setMethod} options={METHODS} />
        </div>
        <DialogFooter>
          <Button size="lg" onClick={confirm} disabled={saving}>
            {saving ? "Saving…" : "Yes, make the receipt"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
