import type { Metadata } from "next";
import { Suspense } from "react";

import { ViewLoader } from "./view-loader";

export const metadata: Metadata = { title: "Receipt" };

export default function ViewPage() {
  return (
    <Suspense>
      <ViewLoader />
    </Suspense>
  );
}
