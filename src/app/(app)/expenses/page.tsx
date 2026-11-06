import type { Metadata } from "next";

import { ExpensesPanel } from "@/components/expenses/expenses-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return (
    <>
      <PageHeader title="Expenses" backHref="/more" />
      <ExpensesPanel />
    </>
  );
}
