"use client";

/* eslint-disable @next/next/no-img-element -- photo preview is a local/signed URL */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { MoneyInput } from "@/components/form/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lagosDate, formatDate } from "@/lib/dates";
import { deleteExpense, expensePhotoUrl, saveExpense, setExpenseCategories } from "@/lib/db";
import { allCategories, cleanCategory, type Expense } from "@/lib/expenses";
import { compressPhoto } from "@/lib/image";
import { cn } from "@/lib/utils";

export function ExpenseForm({
  open,
  onOpenChange,
  expense,
  customCategories,
  onSaved,
  onCategoriesChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editing this expense, or null for a new one. */
  expense: Expense | null;
  customCategories: string[];
  onSaved: () => void;
  onCategoriesChanged: (c: string[]) => void;
}) {
  const [amount, setAmount] = useState<number | null>(expense?.amountKobo ?? null);
  const [category, setCategory] = useState(expense?.category ?? "Stock");
  const [date, setDate] = useState(expense?.date ?? lagosDate());
  const [note, setNote] = useState(expense?.note ?? "");
  const [photo, setPhoto] = useState<Blob | null | undefined>(undefined); // undefined = unchanged
  const [preview, setPreview] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const categories = allCategories(customCategories);

  useEffect(() => {
    if (!expense || photo !== undefined) return;
    let active = true;
    expensePhotoUrl(expense)
      .then((u) => active && setPreview(u))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [expense, photo]);

  async function addCategory() {
    const c = cleanCategory(newCategory ?? "");
    if (!c) return;
    if (!categories.some((x) => x.toLowerCase() === c.toLowerCase())) {
      const next = [...customCategories, c];
      await setExpenseCategories(next).catch(() => undefined);
      onCategoriesChanged(next);
    }
    setCategory(categories.find((x) => x.toLowerCase() === c.toLowerCase()) ?? c);
    setNewCategory(null);
  }

  async function save() {
    if (!amount || amount <= 0) return setError("Enter how much you spent.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Choose a date.");
    setBusy(true);
    try {
      await saveExpense(expense?.id ?? null, { amountKobo: amount, category, date, note: note.trim() }, photo);
      toast.success(expense ? "Expense updated" : "Expense saved");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "New expense"}</DialogTitle>
          <DialogDescription className="sr-only">Amount, category, date, note and photo</DialogDescription>
        </DialogHeader>
        <Field id="expense-amount" label="Amount" error={error}>
          <MoneyInput
            id="expense-amount"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setError(null);
            }}
            invalid={!!error}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Category</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "h-10 cursor-pointer rounded-full border px-3 text-sm font-medium",
                  category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {c}
              </button>
            ))}
            {newCategory === null ? (
              <button type="button" onClick={() => setNewCategory("")} className="flex h-10 cursor-pointer items-center gap-1 rounded-full border border-dashed px-3 text-sm">
                <Plus className="size-4" /> New
              </button>
            ) : (
              <div className="flex w-full gap-2">
                <Input autoFocus value={newCategory} maxLength={40} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Packaging" />
                <Button type="button" onClick={addCategory}>
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
        <Field id="expense-date" label="Date" hint={formatDate(date)}>
          <Input id="expense-date" type="date" value={date} max={lagosDate()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="expense-note" label="Note" optional>
          <Textarea id="expense-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 bags of rice from Mile 12" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Receipt photo <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          {preview && photo !== null ? (
            <div className="relative self-start">
              <img src={preview} alt="Receipt" className="max-h-40 rounded-lg border" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                }}
                className="absolute -top-2 -right-2 flex size-8 cursor-pointer items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="self-start" onClick={() => fileRef.current?.click()}>
              <Camera /> Add photo
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const blob = await compressPhoto(file);
                setPhoto(blob);
                setPreview(URL.createObjectURL(blob));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't use this picture.");
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button size="lg" onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Save expense
          </Button>
          {expense && (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Delete this expense?")) return;
                setBusy(true);
                try {
                  await deleteExpense(expense);
                  toast.success("Expense deleted");
                  onSaved();
                  onOpenChange(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Couldn't delete.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
