"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isCloudConfigured, supabase } from "@/lib/cloud/client";
import { getActiveBusinessId } from "@/lib/cloud/session";

/** Pages inside the app that only need a login (no business chosen yet). */
const NEEDS_LOGIN_ONLY = ["/account"];

type GateState = "checking" | "ok" | "off";

/**
 * Every page inside the app needs a login. Logged-out visitors go to /signin and come back
 * afterwards. Signed in without a business yet → /account to create or choose one.
 * (The data itself is protected by the database's row-level security; this keeps people out of
 * screens that can't work without an account.)
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    if (!isCloudConfigured()) {
      const id = setTimeout(() => setState("off"));
      return () => clearTimeout(id);
    }
    let active = true;
    const here = () => `${window.location.pathname}${window.location.search}`;
    const check = async () => {
      const { data } = await supabase().auth.getSession();
      if (!active) return;
      if (!data.session) {
        router.replace(`/signin?next=${encodeURIComponent(here())}`);
        return;
      }
      if (!getActiveBusinessId() && !NEEDS_LOGIN_ONLY.includes(window.location.pathname)) {
        router.replace(`/account?next=${encodeURIComponent(here())}`);
        return;
      }
      setState("ok");
    };
    void check();
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) router.replace("/signin");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (state === "off")
    return (
      <p role="alert" className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
        Sign-in isn&apos;t set up on this copy of InCeipt yet (missing Supabase settings).
      </p>
    );
  if (state === "checking")
    return (
      <div className="flex min-h-[60dvh] items-center justify-center" aria-busy="true">
        <span className="sr-only">Loading…</span>
        <span className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  return <>{children}</>;
}
