import type { Metadata } from "next";

import { CustomersPanel } from "@/components/customers/customers-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" backHref="/more" />
      <CustomersPanel />
    </>
  );
}
