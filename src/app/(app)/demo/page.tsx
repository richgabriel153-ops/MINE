import type { Metadata } from "next";

import { DemoPanel } from "@/components/demo/demo-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Pro preview", robots: { index: false } };

export default function DemoPage() {
  return (
    <>
      <PageHeader title="Pro preview" backHref="/more" />
      <DemoPanel />
    </>
  );
}
