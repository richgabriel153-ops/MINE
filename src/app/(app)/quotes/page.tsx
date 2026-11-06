import type { Metadata } from "next";

import { QuotesList } from "@/components/document/quotes-list";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Quotations" };

export default function QuotesPage() {
  return (
    <>
      <PageHeader title="Quotations" backHref="/more" />
      <QuotesList />
    </>
  );
}
