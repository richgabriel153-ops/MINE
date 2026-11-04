"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authMessage, cleanEmail, EMAIL_PATTERN, passwordProblem, safeNext, TERMS_VERSION } from "@/lib/auth";
import { isCloudConfigured, supabase } from "@/lib/cloud/client";
import { myBusinesses } from "@/lib/cloud/repo";
import { setActiveBusinessId } from "@/lib/cloud/session";
import { hardNavigate } from "@/lib/navigate";

export type AuthMode = "login" | "signup" | "forgot" | "code";

/** What the form is waiting for: the first screen, or a 6-digit code from an email. */
type Step = "form" | "verify-signup" | "verify-recovery" | "verify-login" | "new-password";

/** After a successful sign-in: go to the business (or set one up / choose one on the account page). */
async function afterSignIn(next: string) {
  const businesses = await myBusinesses().catch(() => []);
  if (businesses.length === 1) {
    setActiveBusinessId(businesses[0].business_id);
    hardNavigate(next);
  } else {
    hardNavigate(`/account?next=${encodeURIComponent(next)}`);
  }
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={72}
        className="pr-12"
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center text-muted-foreground"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCloudConfigured()) {
    return (
      <p role="alert" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Sign-in isn&apos;t set up on this copy of InCeipt yet.
      </p>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const checkEmail = (): string | null => {
    const clean = cleanEmail(email);
    if (!EMAIL_PATTERN.test(clean)) {
      setError("Enter a valid email address.");
      return null;
    }
    setEmail(clean);
    return clean;
  };

  /* ---------- First screens ---------- */

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = checkEmail();
    if (!clean) return;
    const sb = supabase().auth;

    if (mode === "login") {
      if (!password) return setError("Enter your password.");
      void run(async () => {
        const { error: err } = await sb.signInWithPassword({ email: clean, password });
        if (err) {
          if (/email not confirmed/i.test(err.message)) {
            await sb.resend({ type: "signup", email: clean });
            setStep("verify-signup");
            toast.message(`Confirm your email: we sent a code to ${clean}`);
            return;
          }
          throw err;
        }
        await afterSignIn(next);
      });
    } else if (mode === "signup") {
      const problem = passwordProblem(password);
      if (problem) return setError(problem);
      if (!agreed) return setError("Please tick the box to agree to the Terms and Privacy Policy.");
      void run(async () => {
        const { data, error: err } = await sb.signUp({ email: clean, password, options: { data: { terms_version: TERMS_VERSION } } });
        if (err) throw err;
        if (data.session) {
          // Email confirmation is switched off in Supabase: already signed in.
          await supabase().rpc("record_consent", { p_version: TERMS_VERSION });
          await afterSignIn(next);
          return;
        }
        setStep("verify-signup");
        toast.success(`We sent a 6-digit code to ${clean}`);
      });
    } else if (mode === "forgot") {
      void run(async () => {
        const { error: err } = await sb.resetPasswordForEmail(clean);
        if (err) throw err;
        setStep("verify-recovery");
        toast.success(`If ${clean} has an account, a code is on its way`);
      });
    } else {
      void run(async () => {
        const { error: err } = await sb.signInWithOtp({ email: clean, options: { shouldCreateUser: false } });
        if (err && !/signups not allowed|user not found/i.test(err.message)) throw err;
        setStep("verify-login");
        toast.success(`If ${clean} has an account, a code is on its way`);
      });
    }
  };

  /* ---------- Code from the email ---------- */

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setError("Enter the 6-digit code from the email.");
    const sb = supabase().auth;
    void run(async () => {
      const type = step === "verify-signup" ? "signup" : step === "verify-recovery" ? "recovery" : "email";
      const { error: err } = await sb.verifyOtp({ email, token, type });
      if (err) throw err;
      if (step === "verify-signup") {
        await supabase().rpc("record_consent", { p_version: TERMS_VERSION });
        toast.success("Email confirmed. Welcome to InCeipt!");
        await afterSignIn(next);
      } else if (step === "verify-recovery") {
        setPassword("");
        setCode("");
        setStep("new-password");
      } else {
        await afterSignIn(next);
      }
    });
  };

  const resendCode = () => {
    const sb = supabase().auth;
    void run(async () => {
      const { error: err } =
        step === "verify-signup"
          ? await sb.resend({ type: "signup", email })
          : step === "verify-recovery"
            ? await sb.resetPasswordForEmail(email)
            : await sb.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (err) throw err;
      toast.success("New code sent. Check your email (and spam folder).");
    });
  };

  const submitNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    void run(async () => {
      const { error: err } = await supabase().auth.updateUser({ password });
      if (err) throw err;
      toast.success("Password changed. You're logged in.");
      await afterSignIn(next);
    });
  };

  const withNext = (path: string) => `${path}${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (step === "new-password") {
    return (
      <form onSubmit={submitNewPassword} noValidate className="flex flex-col gap-4">
        <Field id="new-password" label="New password" error={error} hint="At least 8 characters, with letters and numbers.">
          <PasswordInput id="new-password" value={password} onChange={(v) => (setPassword(v), setError(null))} autoComplete="new-password" invalid={!!error} />
        </Field>
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Save new password
        </Button>
      </form>
    );
  }

  if (step !== "form") {
    return (
      <form onSubmit={submitCode} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code we sent to <strong className="text-foreground">{email}</strong>. It can take a minute; check your
          spam folder too.
        </p>
        <Field id="auth-code" label="Code" error={error}>
          <Input
            id="auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            placeholder="123456"
            className="text-center text-2xl tracking-[0.4em] amount"
            aria-invalid={!!error || undefined}
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {step === "verify-recovery" ? "Continue" : step === "verify-signup" ? "Confirm email" : "Log in"}
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="min-h-11 cursor-pointer text-primary" onClick={() => (setStep("form"), setCode(""), setError(null))}>
            Use another email
          </button>
          <button type="button" className="min-h-11 cursor-pointer text-primary" onClick={resendCode} disabled={busy}>
            Send a new code
          </button>
        </div>
      </form>
    );
  }

  const label = { login: "Log in", signup: "Create account", forgot: "Email me a reset code", code: "Email me a login code" }[mode];

  return (
    <form onSubmit={submitForm} noValidate className="flex flex-col gap-4">
      <Field id="auth-email" label="Email address" error={mode === "forgot" || mode === "code" ? error : null}>
        <Input
          id="auth-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@example.com"
        />
      </Field>

      {(mode === "login" || mode === "signup") && (
        <Field
          id="auth-password"
          label="Password"
          error={error}
          hint={mode === "signup" ? "At least 8 characters, with letters and numbers." : undefined}
        >
          <PasswordInput
            id="auth-password"
            value={password}
            onChange={(v) => (setPassword(v), setError(null))}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            invalid={!!error}
          />
        </Field>
      )}

      {mode === "signup" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => (setAgreed(e.target.checked), setError(null))}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-primary underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-primary underline">
              Privacy Policy
            </Link>
            , and I&apos;m 18 or older.
          </span>
        </label>
      )}

      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} {label}
      </Button>

      <nav className="flex flex-col items-center gap-1 text-sm">
        {mode === "login" && (
          <>
            <Link href={withNext("/forgot-password")} className="flex min-h-11 items-center text-primary">
              Forgot password?
            </Link>
            <Link href={withNext("/login-code")} className="flex min-h-11 items-center text-primary">
              Log in with an email code instead
            </Link>
            <p className="pt-2 text-muted-foreground">
              New to InCeipt?{" "}
              <Link href={withNext("/signup")} className="font-semibold text-primary">
                Create a free account
              </Link>
            </p>
          </>
        )}
        {mode === "signup" && (
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <Link href={withNext("/signin")} className="font-semibold text-primary">
              Log in
            </Link>
          </p>
        )}
        {(mode === "forgot" || mode === "code") && (
          <Link href={withNext("/signin")} className="flex min-h-11 items-center text-primary">
            Back to log in
          </Link>
        )}
      </nav>
    </form>
  );
}
