import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { StaffPanel } from "@/components/staff/staff-panel";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage() {
  return (
    <>
      <PageHeader title="Staff" backHref="/more" />
      <StaffPanel />
    </>
  );
}
