import type { Metadata } from "next";
import { Suspense } from "react";

import { PayView } from "./pay-view";

export const metadata: Metadata = { title: "Pay invoice", robots: { index: false } };

export default function PayPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4">
      <Suspense>
        <PayView />
      </Suspense>
    </main>
  );
}
