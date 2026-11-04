"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Loader2, Phone, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { PhoneInput } from "@/components/form/phone-input";
import { DocumentCard } from "@/components/history/document-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { customerDocuments, deleteCustomer, listCustomers, saveCustomer, type Customer } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import { owingKobo } from "@/lib/summary";
import type { DocumentRecord } from "@/lib/types";

const PAGE = 30;

/** Everyone the business has made a document for (added automatically), with search and paging. */
export function CustomersPanel() {
  const { access } = useAccess();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<Customer | "new" | null>(null);
  const request = useRef(0);

  const load = useCallback(async (offset: number, s: string) => {
    const id = ++request.current;
    const page = await listCustomers(s, offset, PAGE);
    if (id !== request.current) return;
    setCustomers((prev) => (offset === 0 ? page.customers : [...(prev ?? []), ...page.customers]));
    setHasMore(page.hasMore);
    setError(null);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load(0, search).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load customers."));
    }, 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const more = async () => {
    setLoadingMore(true);
    try {
      await load(customers?.length ?? 0, search);
    } catch {
      toast.error("Couldn't load more. Check your internet connection.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            placeholder="Search name or phone"
            aria-label="Search customers"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="icon" className="size-12" aria-label="Add customer" onClick={() => setOpen("new")}>
          <Plus />
        </Button>
      </div>

      {error && customers === null ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
          <p>Couldn&apos;t load your customers. Check your internet connection.</p>
          <Button variant="outline" onClick={() => void load(0, search).catch(() => {})}>
            Try again
          </Button>
        </div>
      ) : customers === null ? (
        <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-16 animate-pulse rounded-xl border bg-muted/60" />
          ))}
        </ul>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <UserRound className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            {search ? "No customer matches that search." : "Customers are added here automatically when you make a receipt or invoice with their name."}
          </p>
          {!search && (
            <Button asChild>
              <Link href="/create">Make a receipt</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {customers.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c)}
                className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-xs active:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name || "No name"}</span>
                  <span className="block text-sm text-muted-foreground">{c.phone ? formatNgPhone(c.phone) : "No phone number"}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <Button variant="outline" size="lg" onClick={() => void more()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}

      {open && (
        <CustomerDialog
          customer={open === "new" ? null : open}
          canDelete={access?.role === "owner"}
          onClose={() => setOpen(null)}
          onChanged={() => void load(0, search).catch(() => {})}
        />
      )}
    </div>
  );
}

function CustomerDialog({
  customer,
  canDelete,
  onClose,
  onChanged,
}: {
  customer: Customer | null;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(customer === null);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [phoneValid, setPhoneValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRecord[] | null>(customer ? null : []);

  useEffect(() => {
    if (!customer) return;
    let active = true;
    customerDocuments(customer.id)
      .then((d) => active && setDocs(d))
      .catch(() => active && setDocs([]));
    return () => {
      active = false;
    };
  }, [customer]);

  const owed = (docs ?? []).reduce((s, d) => s + owingKobo(d), 0);

  const save = async () => {
    if (!name.trim()) return setError("Enter the customer's name.");
    if (!phoneValid) return setError("Enter a Nigerian mobile number, e.g. 0803 123 4567, or leave it empty.");
    setBusy(true);
    try {
      await saveCustomer(customer?.id ?? null, name.trim(), phone);
      toast.success(customer ? "Customer updated" : "Customer added");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!customer) return;
    setBusy(true);
    try {
      await deleteCustomer(customer.id);
      toast.success("Removed from your customer list. Their receipts and invoices are kept.");
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? customer.name || "Customer" : "Add customer"}</DialogTitle>
          {customer && !editing && (
            <DialogDescription>
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary">
                  <Phone className="size-4" /> {formatNgPhone(customer.phone)}
                </a>
              ) : (
                "No phone number"
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {editing ? (
          <div className="flex flex-col gap-4">
            <Field id="customer-name" label="Name" error={error}>
              <Input id="customer-name" value={name} maxLength={120} onChange={(e) => (setName(e.target.value), setError(null))} />
            </Field>
            <Field id="customer-phone" label="Phone" optional>
              <PhoneInput id="customer-phone" value={phone} onChange={setPhone} onValidityChange={setPhoneValid} />
            </Field>
            <DialogFooter>
              <Button size="lg" onClick={save} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Save
              </Button>
              {customer && (
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {docs === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-sm">
                  {docs.length} {docs.length === 1 ? "document" : "documents"}
                  {owed > 0 && (
                    <>
                      {" "}
                      · owes <strong className="tabular-nums">{formatNaira(owed)}</strong>
                    </>
                  )}
                </p>
                <ul className="flex flex-col gap-2">
                  {docs.slice(0, 20).map((d) => (
                    <li key={d.id}>
                      <DocumentCard doc={d} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>
                Edit name or phone
              </Button>
              {canDelete && (
                <Button variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
                  Remove from list
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
