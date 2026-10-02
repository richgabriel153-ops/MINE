"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useAccess } from "@/components/access/access-provider";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accessToken } from "@/lib/cloud/client";

interface Payouts {
  bankName: string;
  accountName: string;
  accountLast4: string;
}

async function payoutsAction<T>(businessId: string, action: string, extra: Record<string, string> = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch("/api/payouts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, businessId, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}

export function PayoutsPanel() {
  const { access, reload, showUpgrade } = useAccess();
  const businessId = access?.cloud?.businessId;
  const [current, setCurrent] = useState<Payouts | null | undefined>(undefined);
  const [available, setAvailable] = useState(true);
  const [editing, setEditing] = useState(false);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [account, setAccount] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId || !access?.can.payLinks) return;
    payoutsAction<{ payouts: Payouts | null; available: boolean }>(businessId, "status")
      .then((r) => {
        setCurrent(r.payouts);
        setAvailable(r.available);
      })
      .catch(() => setCurrent(null));
  }, [businessId, access?.can.payLinks]);

  useEffect(() => {
    if (!businessId || !(editing || current === null) || banks.length || !available) return;
    payoutsAction<{ banks: { name: string; code: string }[] }>(businessId, "banks")
      .then((r) => setBanks(r.banks))
      .catch((e) => setError(e.message));
  }, [businessId, editing, current, banks.length, available]);

  // Look up the account name as soon as 10 digits are typed.
  useEffect(() => {
    if (!businessId || account.length !== 10 || !bankCode) return;
    let active = true;
    const timer = setTimeout(async () => {
      setChecking(true);
      setError(null);
      try {
        const r = await payoutsAction<{ accountName: string }>(businessId, "resolve", { bankCode, accountNumber: account });
        if (active) setAccountName(r.accountName);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Couldn't find that account.");
      } finally {
        if (active) setChecking(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [businessId, account, bankCode]);

  if (!access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (access.role !== "owner") return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Only the business owner can set this up.</p>;
  if (!access.can.payLinks)
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">Pay Now links are part of InCeipt Pro.</p>
          <Button onClick={() => showUpgrade("Pay Now links")}>See Pro</Button>
        </CardContent>
      </Card>
    );
  if (!businessId) return null;

  async function connect() {
    if (!accountName || !businessId) return;
    setSaving(true);
    try {
      const r = await payoutsAction<{ payouts: Payouts }>(businessId, "connect", { bankCode, accountNumber: account });
      setCurrent(r.payouts);
      setEditing(false);
      await reload();
      toast.success("Online payments are ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>1. Add a Pay Now link to an invoice. It appears on the invoice image, PDF and WhatsApp message.</p>
          <p>2. Your customer pays by card, bank transfer or USSD on Paystack&apos;s secure page.</p>
          <p>3. The invoice is marked paid (or part-paid) automatically, and what they owe updates.</p>
          <p>
            4. Paystack sends the money <strong>straight to your bank account below</strong>, usually the next working
            day. Paystack&apos;s standard fee is taken from each payment.
          </p>
          <p className="flex items-start gap-2 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" /> InCeipt never holds your money and never asks for your
            bank login or Paystack keys.
          </p>
        </CardContent>
      </Card>

      {!available && (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Online payments open soon. Please check back.</p>
      )}

      {current === undefined ? (
        <p className="py-6 text-center text-muted-foreground">Loading…</p>
      ) : current && !editing ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-6 text-primary" />
              <div>
                <div className="font-semibold">Payments go to {current.accountName}</div>
                <div className="text-sm text-muted-foreground">
                  {current.bankName} ••••{current.accountLast4}
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Change account
            </Button>
          </CardContent>
        </Card>
      ) : (
        available && (
          <Card>
            <CardHeader>
              <CardTitle>Where should payments go?</CardTitle>
              <CardDescription>Use your business account. The name must match the account holder.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field id="payout-bank" label="Bank">
                <select
                  id="payout-bank"
                  value={bankCode}
                  onChange={(e) => {
                    setBankCode(e.target.value);
                    setAccountName(null);
                  }}
                  className="h-12 rounded-lg border border-input bg-card px-3 text-base"
                >
                  <option value="">{banks.length ? "Choose your bank" : "Loading banks…"}</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="payout-account" label="Account number" error={error}>
                <Input
                  id="payout-account"
                  inputMode="numeric"
                  maxLength={10}
                  value={account}
                  onChange={(e) => {
                    setAccount(e.target.value.replace(/\D/g, ""));
                    setAccountName(null);
                  }}
                  placeholder="10 digits"
                  className="tracking-wider tabular-nums"
                />
              </Field>
              {checking && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Checking account…
                </p>
              )}
              {accountName && (
                <p className="flex items-center gap-2 rounded-lg bg-secondary p-3 text-sm">
                  <Landmark className="size-5 text-primary" /> <strong>{accountName}</strong>
                </p>
              )}
              <Button size="lg" disabled={!accountName || saving} onClick={connect}>
                {saving && <Loader2 className="animate-spin" />} Yes, send payments here
              </Button>
              {current && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
