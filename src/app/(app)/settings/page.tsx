import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { BackupCard } from "@/components/settings/backup-card";

export const metadata: Metadata = { title: "Backup & settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Backup & settings" backHref="/profile" />
      <div className="flex flex-col gap-4">
        <BackupCard />
      </div>
    </>
  );
}
