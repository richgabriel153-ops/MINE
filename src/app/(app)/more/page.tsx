import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { MoreMenu } from "@/components/more/more-menu";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <MoreMenu />
    </>
  );
}
