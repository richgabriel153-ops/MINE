"use client";

import { useEffect, useState } from "react";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ProLock, useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { MoneyInput } from "@/components/form/money-input";
import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { documentPayments, type PaymentEntry } from "@/lib/cloud/repo";
import { formatDate, lagosDate } from "@/lib/dates";
import { recordPayment } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { computeTotals } from "@/lib/totals";
import type { DocumentRecord, PaymentMethod } from "@/lib/types";

const METHODS = [
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
] as const satisfies readonly { value: PaymentMethod; label: string }[];

/** "Record a payment" for documents with money still owed (Pro; staff allowed). */
export function RecordPayment({ doc, onRecorded }: { doc: DocumentRecord; onRecorded: (updated: DocumentRecord) => void }) {
  const { access, requirePro } = useAccess();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const balance = computeTotals(doc).balanceKobo;
  if (balance <= 0 || doc.sourceInvoiceId || doc.receiptId) return null;

  async function save() {
    if (!amount || amount <= 0) return setError("Enter the amount received.");
    if (amount > balance) return setError(`That's more than the balance of ${formatNaira(balance)}.`);
    setBusy(true);
    try {
      const updated = await recordPayment(doc.id, amount, method, lagosDate());
      onRecorded(updated);
      toast.success(`${formatNaira(amount)} recorded`);
      setOpen(false);
      setAmount(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          if (!requirePro("Recording payments")) return;
          setOpen(true);
        }}
      >
        <Banknote /> Record a payment {!access?.can.trackDebts && <ProLock />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              {doc.number} · balance {formatNaira(balance)}
            </DialogDescription>
          </DialogHeader>
          <Field id="pay-amount-received" label="Amount received" error={error}>
            <MoneyInput
              id="pay-amount-received"
              value={amount}
              onChange={(v) => {
                setAmount(v);
                setError(null);
              }}
              invalid={!!error}
            />
          </Field>
          <Button type="button" variant="link" className="-mt-2 h-8 self-start px-0" onClick={() => setAmount(balance)}>
            Paid the full balance ({formatNaira(balance)})
          </Button>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Paid by</span>
            <Segmented label="Payment method" value={method} onChange={setMethod} options={METHODS} />
          </div>
          <DialogFooter>
            <Button size="lg" onClick={save} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const METHOD_LABEL: Record<string, string> = { transfer: "Transfer", cash: "Cash", pos: "POS", online: "Paid online" };

/** Owner-only list of payments on a document (account mode). */
export function PaymentHistory({ doc }: { doc: DocumentRecord }) {
  const { access } = useAccess();
  const [payments, setPayments] = useState<PaymentEntry[] | null>(null);
  const show = access?.mode === "cloud" && access.role === "owner" && doc.type !== "quote" && !doc.sourceInvoiceId;
  const key = `${doc.id}:${doc.updatedAt}:${doc.amountPaidKobo}:${doc.status}`;

  useEffect(() => {
    if (!show) return;
    let active = true;
    documentPayments(doc.id)
      .then((p) => active && setPayments(p))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [show, doc.id, key]);

  if (!show || !payments || payments.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Payments</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {payments.map((p, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>
              {formatDate(p.paid_on)} · {METHOD_LABEL[p.method] ?? p.method}
              {p.created_by_name && <span className="text-muted-foreground"> · {p.created_by_name}</span>}
            </span>
            <span className="font-semibold tabular-nums">{formatNaira(p.amount_kobo)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
