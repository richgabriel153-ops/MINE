import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountPanel } from "@/components/account/account-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account" backHref="/more" />
      <Suspense>
        <AccountPanel />
      </Suspense>
    </>
  );
}
