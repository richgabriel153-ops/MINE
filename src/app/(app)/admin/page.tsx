import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Admin dashboard" backHref="/more" />
      <AdminPanel />
    </>
  );
}
