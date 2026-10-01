import type { Metadata } from "next";
import { Suspense } from "react";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProfileLoader } from "./profile-loader";

export const metadata: Metadata = { title: "Business details" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Business details"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">
              <ShieldCheck /> Backup
            </Link>
          </Button>
        }
      />
      <Suspense>
        <ProfileLoader />
      </Suspense>
    </>
  );
}
