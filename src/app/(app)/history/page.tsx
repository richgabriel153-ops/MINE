import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { HistoryList } from "./history-list";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="History" />
      <Suspense>
        <HistoryList />
      </Suspense>
    </>
  );
}
