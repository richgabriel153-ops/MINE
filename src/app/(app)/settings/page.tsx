import type { Metadata } from "next";

import Link from "next/link";
import { BadgeCheck, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { BackupCard } from "@/components/settings/backup-card";

export const metadata: Metadata = { title: "Backup & settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Backup & settings" backHref="/profile" />
      <div className="flex flex-col gap-4">
        <BackupCard />
        <Link href="/pro" className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
          <BadgeCheck className="size-6 text-primary" />
          <span className="flex-1">
            <span className="block font-semibold">InCeipt Pro</span>
            <span className="block text-sm text-muted-foreground">No footer, extra templates, unlimited history</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
      </div>
    </>
  );
}
