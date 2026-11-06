import type { Metadata } from "next";

import { ProfitPanel } from "@/components/expenses/profit-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Profit" };

export default function ProfitPage() {
  return (
    <>
      <PageHeader title="Profit" backHref="/more" />
      <ProfitPanel />
    </>
  );
}
