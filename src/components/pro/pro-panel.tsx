"use client";

import { useState } from "react";
import { BadgeCheck, CheckCircle2, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePro } from "@/hooks/use-pro";
import { formatDate, lagosDate } from "@/lib/dates";
import { setProUnlocked } from "@/lib/db";
import { paymentLink, PRO_BENEFITS } from "@/lib/pro";

export function ProPanel() {
  const [pro, setPro] = usePro();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const link = paymentLink();

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the code you received after paying.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) {
        setError(data.error ?? "That code didn't work. Check it and try again.");
        return;
      }
      setPro(await setProUnlocked());
      toast.success("Pro unlocked. Thank you for your support!");
    } catch {
      setError("You need internet to check the code. Please connect and try again.");
    } finally {
      setChecking(false);
    }
  }

  if (pro === null) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#0b7a4b] to-[#0a5c3a] p-5 text-white shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold opacity-90">
          <BadgeCheck className="size-5" /> ReceiptNaija Pro
        </div>
        <p className="mt-2 text-2xl leading-tight font-bold">
          {pro.unlocked ? "You're on Pro. Thank you!" : "Look more professional to every customer"}
        </p>
        {pro.unlocked && pro.unlockedAt && (
          <p className="mt-1 text-sm opacity-85">Unlocked on {formatDate(lagosDate(new Date(pro.unlockedAt)))}</p>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          {PRO_BENEFITS.map((b) => (
            <div key={b.title} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <div className="font-semibold">{b.title}</div>
                <div className="text-sm text-muted-foreground">{b.text}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {!pro.unlocked && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>1. Pay securely with Paystack</CardTitle>
              <CardDescription>Card, bank transfer or USSD. You&apos;ll get an unlock code after paying.</CardDescription>
            </CardHeader>
            <CardContent>
              {link ? (
                <Button asChild size="lg" className="w-full">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    Upgrade to Pro <ExternalLink />
                  </a>
                </Button>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  Payment isn&apos;t available yet. Please check back soon.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Enter your unlock code</CardTitle>
              <CardDescription>Already paid? Type the code here. Pro is saved on this phone.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={unlock} noValidate className="flex flex-col gap-3">
                <Field id="unlock-code" label="Unlock code" error={error}>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="unlock-code"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. NAIJA-PRO-1234"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      className="pl-10 tracking-wider uppercase"
                      aria-invalid={!!error || undefined}
                      maxLength={64}
                    />
                  </div>
                </Field>
                <Button type="submit" variant="outline" disabled={checking}>
                  {checking ? <Loader2 className="animate-spin" /> : null}
                  {checking ? "Checking…" : "Unlock Pro"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
