import type { Metadata } from "next";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <>
      <PageHeader title="InCeipt Assistant" backHref="/more" />
      <AssistantPanel />
    </>
  );
}
