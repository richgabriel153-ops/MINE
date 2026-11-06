import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/account/auth-form";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="mt-1 mb-6 text-muted-foreground">Enter your email and we&apos;ll send you a 6-digit code to choose a new password.</p>
      <Suspense>
        <AuthForm mode="forgot" />
      </Suspense>
    </>
  );
}
