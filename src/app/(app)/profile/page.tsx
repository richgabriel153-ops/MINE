import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileLoader } from "./profile-loader";

export const metadata: Metadata = { title: "Business details" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Business details" backHref="/more" />
      <Suspense>
        <ProfileLoader />
      </Suspense>
    </>
  );
}
