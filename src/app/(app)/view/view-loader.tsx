"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Pencil, Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ShareBar } from "@/components/share/share-bar";
import { getTemplate } from "@/components/templates";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { TemplatePicker } from "@/components/templates/template-picker";
import { Button } from "@/components/ui/button";
import { getDocument, getProfile, setDocumentTemplate, updateSettings } from "@/lib/db";
import type { BusinessProfile, DocumentRecord, TemplateId } from "@/lib/types";

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

  return <DocumentView initialDoc={loaded.doc} profile={loaded.profile} />;
}

function DocumentView({ initialDoc, profile }: { initialDoc: DocumentRecord; profile: BusinessProfile }) {
  const [doc, setDoc] = useState(initialDoc);
  const exportRef = useRef<HTMLDivElement>(null);
  const template = getTemplate(doc.templateId);
  const Template = template.Component;
  // Free version shows the footer; Pro (stage 4) will turn it off.
  const showFooterBrand = true;

  async function changeTemplate(templateId: TemplateId) {
    setDoc((d) => ({ ...d, templateId }));
    await Promise.all([setDocumentTemplate(doc.id, templateId), updateSettings({ lastTemplate: templateId })]);
  }

  return (
    <>
      <PageHeader title={doc.number} backHref="/history" />
      <div className="flex flex-col gap-4">
        <TemplatePicker value={doc.templateId} onChange={changeTemplate} brandColor={profile.brandColor} />
        <ScaledPreview width={template.width}>
          <Template doc={doc} profile={profile} showFooterBrand={showFooterBrand} />
        </ScaledPreview>
        <ShareBar doc={doc} profile={profile} exportRef={exportRef} renderKey={`${doc.id}:${doc.templateId}:${doc.updatedAt}`} />
        <div className="grid grid-cols-2 gap-3">
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
          <Button asChild variant="ghost" className="col-span-2">
            <Link href={doc.type === "invoice" ? "/create?type=invoice" : "/create"}>
              <Plus /> New {doc.type}
            </Link>
          </Button>
        </div>
      </div>

      {/* Full-size copy, off screen, used to make the image and PDF. */}
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
        <div ref={exportRef} style={{ width: template.width }}>
          <Template doc={doc} profile={profile} showFooterBrand={showFooterBrand} />
        </div>
      </div>
    </>
  );
}
