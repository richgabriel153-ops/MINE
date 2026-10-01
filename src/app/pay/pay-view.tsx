"use client";

/* eslint-disable @next/next/no-img-element -- business logo is a data: URL */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

import { MoneyInput } from "@/components/form/money-input";
import { Field } from "@/components/form/field";
import { Segmented } from "@/components/form/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readableTextOn } from "@/lib/color";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { checkPayAmount, isValidEmail } from "@/lib/pay-amount";

interface PublicInvoice {
  businessName: string;
  logo: string;
  brandColor: string;
  number: string;
  customerName: string;
  issueDate: string;
  dueDate: string | null;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  items: { description: string; quantity: number }[];
}

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; invoice: PublicInvoice; justPaid: boolean };

export function PayView() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  const reference = params.get("reference") ?? params.get("trxref");
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [mode, setMode] = useState<"full" | "part">("full");
  const [amount, setAmount] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams({ t: token, ...(reference ? { reference } : {}) });
    fetch(`/api/pay?${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) setLoaded({ state: "error", message: data.error ?? "This payment link isn't working right now." });
        else setLoaded({ state: "ready", invoice: data.invoice, justPaid: data.justPaid });
      })
      .catch(() => active && setLoaded({ state: "error", message: "No internet connection. Please try again." }));
    return () => {
      active = false;
    };
  }, [token, reference]);

  if (loaded.state === "loading") return <p className="py-20 text-center text-muted-foreground">Loading…</p>;
  if (loaded.state === "error") return <p className="py-20 text-center">{loaded.message}</p>;

  const { invoice, justPaid } = loaded;
  const brand = invoice.brandColor;
  const payKobo = mode === "full" ? invoice.balanceKobo : (amount ?? 0);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter your email address for your payment receipt.");
      return;
    }
    const problem = checkPayAmount(payKobo, invoice.balanceKobo);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, email, amountKobo: payKobo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't start the payment. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header style={{ backgroundColor: brand, color: readableTextOn(brand) }} className="-mx-4 flex items-center gap-3 px-4 py-5">
        {invoice.logo && (
          <span className="flex size-12 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
            <img src={invoice.logo} alt="" className="max-h-full max-w-full object-contain" />
          </span>
        )}
        <div>
          <div className="text-lg font-bold">{invoice.businessName}</div>
          <div className="text-sm opacity-85">Invoice {invoice.number}</div>
        </div>
      </header>

      {justPaid && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-secondary p-4">
          <CheckCircle2 className="size-6 text-primary" />
          <div>
            <div className="font-semibold">Payment received. Thank you!</div>
            <div className="text-sm text-muted-foreground">{invoice.businessName} has been notified.</div>
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        {invoice.customerName && <div className="text-sm text-muted-foreground">For {invoice.customerName}</div>}
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {invoice.items.map((i, n) => (
            <li key={n}>
              {i.description} {i.quantity !== 1 && <span className="text-muted-foreground">× {i.quantity}</span>}
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total</dt>
            <dd>{formatNaira(invoice.totalKobo)}</dd>
          </div>
          {invoice.paidKobo > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid</dt>
              <dd>{formatNaira(invoice.paidKobo)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <dt>Amount due</dt>
            <dd>{formatNaira(invoice.balanceKobo)}</dd>
          </div>
          {invoice.dueDate && invoice.balanceKobo > 0 && (
            <div className="text-xs text-muted-foreground">Due by {formatDate(invoice.dueDate)}</div>
          )}
        </dl>
      </section>

      {invoice.balanceKobo === 0 ? (
        <p className="rounded-xl bg-secondary p-4 text-center font-semibold">This invoice is fully paid. Thank you!</p>
      ) : (
        <form onSubmit={pay} noValidate className="flex flex-col gap-4">
          <Segmented
            label="How much to pay"
            value={mode}
            onChange={setMode}
            options={[
              { value: "full", label: "Pay in full" },
              { value: "part", label: "Pay part" },
            ]}
          />
          {mode === "part" && (
            <Field id="pay-amount" label="Amount to pay now">
              <MoneyInput id="pay-amount" value={amount} onChange={setAmount} />
            </Field>
          )}
          <Field id="pay-email" label="Your email" hint="Paystack sends your payment receipt here." error={error}>
            <Input
              id="pay-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="you@example.com"
            />
          </Field>
          <Button type="submit" size="lg" disabled={busy} style={{ backgroundColor: brand, color: readableTextOn(brand) }}>
            {busy && <Loader2 className="animate-spin" />} Pay {formatNaira(payKobo)}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> Secure payment by Paystack · Card, bank transfer or USSD
          </p>
        </form>
      )}
      <p className="pb-6 text-center text-xs text-muted-foreground">Invoice sent with InCeipt</p>
    </div>
  );
}
