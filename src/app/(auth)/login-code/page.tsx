import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";

export const metadata: Metadata = { title: "Log in with a code", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Log in with a code</h1>
      <p className="mt-1 mb-6 text-muted-foreground">No password? We&apos;ll email you a 6-digit code instead.</p>
      <Suspense>
        <AuthForm mode="code" />
      </Suspense>
    </>
  );
}
