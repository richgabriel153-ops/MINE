import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { DataCard } from "@/components/settings/data-card";

export const metadata: Metadata = { title: "Your data" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Your data" backHref="/more" />
      <div className="flex flex-col gap-4">
        <DataCard />
      </div>
    </>
  );
}
