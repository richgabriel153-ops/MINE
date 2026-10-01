import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProPanel } from "@/components/pro/pro-panel";

export const metadata: Metadata = { title: "Go Pro" };

export default function ProPage() {
  return (
    <>
      <PageHeader title="Go Pro" backHref="/home" />
      <ProPanel />
    </>
  );
}
