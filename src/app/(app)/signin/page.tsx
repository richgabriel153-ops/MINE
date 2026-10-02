import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { SignInForm } from "@/components/account/signin-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <PageHeader title="Sign in to InCeipt" backHref="/more" />
      <p className="mb-5 text-muted-foreground">
        An account keeps your records safe online, and is needed for Pro: subscriptions, staff, Pay Now links and more.
      </p>
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  );
}
