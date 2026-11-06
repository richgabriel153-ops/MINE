import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ProPanel } from "@/components/pro/pro-panel";

export const metadata: Metadata = { title: "InCeipt Pro" };

export default function ProPage() {
  return (
    <>
      <PageHeader title="InCeipt Pro" backHref="/more" />
      <Suspense>
        <ProPanel />
      </Suspense>
    </>
  );
}
