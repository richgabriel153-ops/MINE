"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { afterSignIn, NewPasswordForm } from "@/components/account/auth-form";
import { Button } from "@/components/ui/button";
import { authMessage, parseAuthRedirect, safeNext, TERMS_VERSION } from "@/lib/auth";
import { isCloudConfigured, supabase } from "@/lib/cloud/client";

type State = { step: "working" } | { step: "new-password" } | { step: "error"; message: string };

/** Where the buttons in InCeipt's emails land: confirms the email, logs in, or opens "choose a new password". */
export function ConfirmLink() {
  const next = safeNext(useSearchParams().get("next"));
  const [state, setState] = useState<State>({ step: "working" });

  useEffect(() => {
    let active = true;
    const fail = (message: string) => active && setState({ step: "error", message });
    (async () => {
      if (!isCloudConfigured()) return fail("Sign-in isn't set up on this copy of InCeipt yet.");
      const link = parseAuthRedirect(window.location.hash, window.location.search);
      // Remove the one-time tokens from the address bar straight away.
      window.history.replaceState(null, "", `${window.location.pathname}?next=${encodeURIComponent(next)}`);
      if (!link) return fail("This link is missing information. Ask for a new email below.");
      if (link.kind === "error") return fail(link.message);

      const auth = supabase().auth;
      let type: string;
      if (link.kind === "session") {
        const { error } = await auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
        if (error) throw error;
        type = link.type;
      } else {
        const { error } = await auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
        if (error) throw error;
        type = link.type;
      }
      if (!active) return;
      if (type === "recovery") return setState({ step: "new-password" });
      if (type === "signup" || type === "invite") await supabase().rpc("record_consent", { p_version: TERMS_VERSION });
      await afterSignIn(next);
    })().catch((err: unknown) => fail(authMessage(err)));
    return () => {
      active = false;
    };
  }, [next]);

  if (state.step === "new-password")
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-1 mb-6 text-muted-foreground">Your email is confirmed. Pick a new password to finish.</p>
        <NewPasswordForm next={next} />
      </>
    );

  if (state.step === "error")
    return (
      <div role="alert" className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">That link didn&apos;t work</h1>
        <p className="text-muted-foreground">{state.message}</p>
        <Button asChild size="lg">
          <Link href="/signin">Log in</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/forgot-password">Reset my password</Link>
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-muted-foreground">Confirming, one moment…</p>
    </div>
  );
}
