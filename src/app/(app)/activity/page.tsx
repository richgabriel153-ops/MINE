import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ActivityList } from "@/components/staff/activity-list";

export const metadata: Metadata = { title: "Activity log" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity log" backHref="/more" />
      <ActivityList />
    </>
  );
}
