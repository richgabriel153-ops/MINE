import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TaxPanel } from "@/components/tax/tax-panel";

export const metadata: Metadata = { title: "Tax" };

export default function TaxPage() {
  return (
    <>
      <PageHeader title="Tax" backHref="/more" />
      <TaxPanel />
    </>
  );
}
