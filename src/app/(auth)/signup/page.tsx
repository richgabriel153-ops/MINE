import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";

export const metadata: Metadata = { title: "Create your free account", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Create your free account</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Make receipts and invoices in seconds. Your records are kept safe online.</p>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </>
  );
}
