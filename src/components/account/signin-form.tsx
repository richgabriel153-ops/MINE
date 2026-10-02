"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError, isCloudConfigured, supabase } from "@/lib/cloud/client";
import { myBusinesses } from "@/lib/cloud/repo";
import { setActiveBusinessId } from "@/lib/cloud/session";
import { hardNavigate } from "@/lib/navigate";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Safe in-app path to return to after signing in. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCloudConfigured()) {
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        InCeipt accounts aren&apos;t switched on yet. You can keep using the app on this phone without an account.
      </p>
    );
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase().auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
      if (err) throw err;
      setEmail(clean);
      setStep("code");
      toast.success(`We sent a code to ${clean}`);
    } catch (err) {
      setError(friendlyError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the code from the email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase().auth.verifyOtp({ email, token, type: "email" });
      if (err) throw err;
      const businesses = await myBusinesses();
      if (businesses.length === 1) {
        setActiveBusinessId(businesses[0].business_id);
        hardNavigate(next ?? "/home");
      } else {
        // Several businesses (choose) or none yet (set up): handled on the account page.
        router.replace(`/account${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      }
    } catch (err) {
      setError(/expired|invalid/i.test(String((err as Error)?.message)) ? "That code is wrong or has expired. Try again or get a new code." : friendlyError(err).message);
      setBusy(false);
    }
  }

  return step === "email" ? (
    <form onSubmit={sendCode} noValidate className="flex flex-col gap-4">
      <Field id="signin-email" label="Email address" error={error} hint="We'll email you a 6-digit code. No password needed.">
        <Input
          id="signin-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@example.com"
          aria-invalid={!!error || undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Mail />} Email me a code
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  ) : (
    <form onSubmit={verify} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Enter the code we sent to <strong className="text-foreground">{email}</strong>. Check your spam folder if it
        doesn&apos;t arrive in a minute.
      </p>
      <Field id="signin-code" label="Code" error={error}>
        <Input
          id="signin-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 10));
            setError(null);
          }}
          placeholder="123456"
          className="text-center text-2xl tracking-[0.4em] tabular-nums"
          aria-invalid={!!error || undefined}
          autoFocus
        />
      </Field>
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Sign in
      </Button>
      <div className="flex justify-between text-sm">
        <button type="button" className="cursor-pointer text-primary" onClick={() => setStep("email")}>
          Use another email
        </button>
        <button type="button" className="cursor-pointer text-primary" onClick={() => sendCode()} disabled={busy}>
          Send a new code
        </button>
      </div>
    </form>
  );
}
