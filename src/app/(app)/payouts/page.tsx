import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { PayoutsPanel } from "@/components/payouts/payouts-panel";

export const metadata: Metadata = { title: "Get paid online" };

export default function PayoutsPage() {
  return (
    <>
      <PageHeader title="Get paid online" backHref="/more" />
      <PayoutsPanel />
    </>
  );
}
