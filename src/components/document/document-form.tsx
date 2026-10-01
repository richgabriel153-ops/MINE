"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { LineItemsEditor } from "@/components/document/line-items-editor";
import { TotalsPanel } from "@/components/document/totals-panel";
import { Field } from "@/components/form/field";
import { MoneyInput } from "@/components/form/money-input";
import { PhoneInput } from "@/components/form/phone-input";
import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createDocument, updateDocument, updateSettings } from "@/lib/db";
import {
  defaultStatus,
  formTotals,
  hasErrors,
  NOTE_SUGGESTIONS,
  toDraft,
  validateForm,
  type DocumentFormState,
  type FormErrors,
} from "@/lib/document-form";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { hasBankDetails } from "@/lib/profile";
import { VAT_PERCENT } from "@/lib/totals";
import type { BusinessProfile, DocType, PaymentMethod, PaymentStatus } from "@/lib/types";

const TYPE_OPTIONS = [
  { value: "receipt", label: "Receipt" },
  { value: "invoice", label: "Invoice" },
] as const satisfies readonly { value: DocType; label: string }[];

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "part", label: "Part paid" },
  { value: "unpaid", label: "Unpaid" },
] as const satisfies readonly { value: PaymentStatus; label: string }[];

const METHOD_OPTIONS = [
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
] as const satisfies readonly { value: PaymentMethod; label: string }[];

const DISCOUNT_OPTIONS = [
  { value: "amount", label: "₦" },
  { value: "percent", label: "%" },
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function DocumentForm({
  initial,
  editingId,
  number,
  profile,
}: {
  initial: DocumentFormState;
  /** Set when editing an existing document. */
  editingId?: string;
  /** The document number (existing, or the one it will get). */
  number: string;
  profile: BusinessProfile;
}) {
  const router = useRouter();
  const { access, requirePro } = useAccess();
  const canTrackDebts = access?.can.trackDebts ?? false;
  // Free users keep read-only access to part payments recorded before debt tracking became Pro.
  const legacyPartPayment = !canTrackDebts && initial.status === "part";
  const [form, setForm] = useState(initial);
  // Errors appear after the first Save attempt, then update live as the user fixes things.
  const [triedSave, setTriedSave] = useState(false);
  const [phoneValid, setPhoneValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [numberShown, setNumberShown] = useState(number);
  const totals = useMemo(() => formTotals(form), [form]);
  const errors: FormErrors = useMemo(
    () => (triedSave ? validateForm(form, phoneValid) : {}),
    [triedSave, form, phoneValid],
  );
  const isInvoice = form.type === "invoice";
  const needsProfile = profile.name.trim() === "";

  function set<K extends keyof DocumentFormState>(key: K, value: DocumentFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function changeType(type: DocType) {
    setForm((f) => ({ ...f, type, status: defaultStatus(type) }));
    setNumberShown((n) => (type === "invoice" ? n.replace("RCT", "INV") : n.replace("INV", "RCT")));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsProfile) {
      toast.error("Add your business name first.");
      return;
    }
    const found = validateForm(form, phoneValid);
    setTriedSave(true);
    if (hasErrors(found)) {
      toast.error("Please check the highlighted fields.");
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
      });
      return;
    }
    setSaving(true);
    try {
      const draft = toDraft(form);
      const saved = editingId ? await updateDocument(editingId, draft) : await createDocument(draft);
      await updateSettings({ lastNotes: draft.notes });
      toast.success(editingId ? "Changes saved" : `${saved.number} saved`);
      router.push(`/view?id=${saved.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate data-sticky-save className="flex flex-col gap-7">
      {needsProfile && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-secondary p-4">
          <div className="flex items-start gap-3">
            <Store className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-sm">
              <strong>First, add your business name.</strong> It appears at the top of your receipts. It takes a
              minute and you only do it once.
            </p>
          </div>
          <Button asChild>
            <Link href={`/profile?next=${encodeURIComponent("/create" + (isInvoice ? "?type=invoice" : ""))}`}>
              Add business details
            </Link>
          </Button>
        </div>
      )}

      {!editingId && (
        <Segmented label="Document type" value={form.type} onChange={changeType} options={TYPE_OPTIONS} />
      )}
      <p className="-mt-4 text-sm text-muted-foreground">
        {editingId ? "Editing" : "This will be"} <span className="font-semibold text-foreground">{numberShown}</span>
      </p>

      <Section title="Customer">
        <Field id="customer-name" label="Customer name" optional>
          <Input
            id="customer-name"
            value={form.customerName}
            onChange={(e) => set("customerName", e.target.value)}
            placeholder="e.g. Mrs Bisi Adeyemi"
            autoComplete="off"
            maxLength={80}
          />
        </Field>
        <Field id="customer-phone" label="Customer phone" optional error={errors.customerPhone}>
          <PhoneInput
            id="customer-phone"
            value={form.customerPhone}
            onChange={(v) => set("customerPhone", v)}
            onValidityChange={setPhoneValid}
            invalid={!!errors.customerPhone}
          />
        </Field>
      </Section>

      <Section title="Items">
        <LineItemsEditor items={form.items} onChange={(items) => set("items", items)} errors={errors.itemErrors} />
        {errors.items && (
          <p role="alert" className="text-sm text-destructive">
            {errors.items}
          </p>
        )}
      </Section>

      <Section title="Extras">
        <Field id="discount" label="Discount" optional error={errors.discount}>
          <div className="grid grid-cols-[6.5rem_1fr] gap-2">
            <Segmented
              label="Discount type"
              value={form.discountType}
              onChange={(v) => set("discountType", v)}
              options={DISCOUNT_OPTIONS}
            />
            {form.discountType === "amount" ? (
              <MoneyInput id="discount" value={form.discountKobo} onChange={(v) => set("discountKobo", v)} />
            ) : (
              <div className="relative">
                <Input
                  id="discount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  className="pr-8 tabular-nums"
                  defaultValue={form.discountPercent ?? ""}
                  aria-invalid={!!errors.discount || undefined}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    const n = /^\d+(\.\d{0,2})?$/.test(v) ? Number(v) : null;
                    set("discountPercent", n);
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
                  %
                </span>
              </div>
            )}
          </div>
        </Field>
        <Field id="delivery" label="Delivery fee" optional>
          <MoneyInput id="delivery" value={form.deliveryKobo} onChange={(v) => set("deliveryKobo", v)} />
        </Field>
        <label
          htmlFor="vat"
          className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2"
        >
          <span className="flex flex-col">
            <span className="text-sm font-medium">Add VAT ({VAT_PERCENT}%)</span>
            <span className="text-xs text-muted-foreground">Only if your business charges VAT</span>
          </span>
          <Switch id="vat" checked={form.vatEnabled} onCheckedChange={(v) => set("vatEnabled", v)} />
        </label>
      </Section>

      <TotalsPanel totals={totals} status={form.status} />

      <Section title="Payment">
        <Segmented
          label="Payment status"
          value={form.status}
          onChange={(v) => {
            if (v === "part" && !canTrackDebts && !legacyPartPayment && !requirePro("Part payments")) return;
            set("status", v);
          }}
          options={STATUS_OPTIONS.map((o) => (o.value === "part" && !canTrackDebts ? { ...o, locked: true } : o))}
        />
        {form.status === "part" && (
          <Field
            id="amount-paid"
            label="Amount paid so far"
            error={errors.amountPaid}
            hint={`Balance: ${formatNaira(totals.balanceKobo)}`}
          >
            <MoneyInput
              id="amount-paid"
              value={form.amountPaidKobo}
              onChange={(v) => set("amountPaidKobo", v)}
              invalid={!!errors.amountPaid}
              disabled={legacyPartPayment}
            />
            {legacyPartPayment && (
              <p className="text-sm text-muted-foreground">
                Recording part payments is now a Pro feature. You can still see this balance, or choose{" "}
                <strong>Paid</strong> once the customer pays in full.
              </p>
            )}
          </Field>
        )}
        {form.status !== "unpaid" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Paid by</span>
            <Segmented
              label="Payment method"
              value={form.method}
              onChange={(v) => set("method", v)}
              options={METHOD_OPTIONS}
            />
          </div>
        )}
        {isInvoice && !hasBankDetails(profile) && !needsProfile && (
          <p className="text-sm text-muted-foreground">
            Tip:{" "}
            <Link className="font-medium text-primary underline" href="/profile">
              add your bank details
            </Link>{" "}
            so they show on invoices.
          </p>
        )}
      </Section>

      <Section title="Dates">
        <div className="grid grid-cols-2 gap-3">
          <Field id="issue-date" label={isInvoice ? "Invoice date" : "Date"} error={errors.issueDate}>
            <Input
              id="issue-date"
              type="date"
              value={form.issueDate}
              onChange={(e) => set("issueDate", e.target.value)}
            />
            <span className="text-xs text-muted-foreground">{formatDate(form.issueDate)}</span>
          </Field>
          {isInvoice && (
            <Field id="due-date" label="Due date" error={errors.dueDate}>
              <Input
                id="due-date"
                type="date"
                value={form.dueDate}
                min={form.issueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                aria-invalid={!!errors.dueDate || undefined}
              />
              <span className="text-xs text-muted-foreground">{formatDate(form.dueDate)}</span>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Notes">
        <Field id="notes" label="Note for the customer" optional>
          <Textarea
            id="notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="e.g. No refund after 3 days"
            maxLength={300}
          />
        </Field>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {NOTE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set("notes", form.notes.trim() ? `${form.notes.trim()} ${s}` : s)}
              className="h-10 shrink-0 cursor-pointer rounded-full border bg-card px-3 text-sm whitespace-nowrap"
            >
              + {s}
            </button>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-0 z-30 -mx-4 flex items-center gap-3 border-t bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums">{formatNaira(totals.totalKobo)}</span>
        </div>
        <Button type="submit" size="lg" className="flex-1" disabled={saving}>
          {saving ? "Saving…" : editingId ? "Save changes" : `Save ${isInvoice ? "invoice" : "receipt"}`}
        </Button>
      </div>
    </form>
  );
}
