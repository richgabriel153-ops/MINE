"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Pencil, Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ClassicTemplate } from "@/components/templates/classic";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { Button } from "@/components/ui/button";
import { getDocument, getProfile } from "@/lib/db";
import type { BusinessProfile, DocumentRecord } from "@/lib/types";

type Loaded = { state: "loading" } | { state: "missing" } | { state: "ready"; doc: DocumentRecord; profile: BusinessProfile };

export function ViewLoader() {
  const id = useSearchParams().get("id");
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const [doc, profile] = await Promise.all([id ? getDocument(id) : undefined, getProfile()]);
      if (active) setLoaded(doc ? { state: "ready", doc, profile } : { state: "missing" });
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loaded.state === "loading") return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

  if (loaded.state === "missing")
    return (
      <>
        <PageHeader title="Not found" backHref="/home" />
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p>We couldn&apos;t find that receipt. It may have been deleted.</p>
          <Button asChild>
            <Link href="/history">See all receipts</Link>
          </Button>
        </div>
      </>
    );

  const { doc, profile } = loaded;
  return (
    <>
      <PageHeader title={doc.number} backHref="/history" />
      <ScaledPreview>
        <ClassicTemplate doc={doc} profile={profile} showFooterBrand />
      </ScaledPreview>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button asChild variant="outline">
          <Link href={`/create?edit=${doc.id}`}>
            <Pencil /> Edit
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/create?duplicate=${doc.id}`}>
            <Copy /> Make a copy
          </Link>
        </Button>
        <Button asChild className="col-span-2">
          <Link href={doc.type === "invoice" ? "/create?type=invoice" : "/create"}>
            <Plus /> New {doc.type}
          </Link>
        </Button>
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Sharing to WhatsApp and downloading come in the next update.
      </p>
    </>
  );
}
