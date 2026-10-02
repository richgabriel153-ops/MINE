import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateLoader } from "./create-loader";

export const metadata: Metadata = { title: "New receipt" };

export default function CreatePage() {
  return (
    <Suspense>
      <CreateLoader />
    </Suspense>
  );
}
