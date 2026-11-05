import type { Metadata } from "next";
import { Suspense } from "react";

import { ConfirmLink } from "@/components/account/confirm-link";

export const metadata: Metadata = { title: "Confirming", robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <ConfirmLink />
    </Suspense>
  );
}
