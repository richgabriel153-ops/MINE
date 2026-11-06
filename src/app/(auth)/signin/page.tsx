import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Log in</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Welcome back. Log in to see your receipts and invoices.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
