"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Copy, Pencil, Plus, Trash2 } from "lucide-react";

import { DeleteDialog } from "@/components/document/delete-dialog";
import { canMarkPaid, MarkPaidDialog } from "@/components/document/mark-paid-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { ShareBar } from "@/components/share/share-bar";
import { getTemplate } from "@/components/templates";
import { ScaledPreview } from "@/components/templates/scaled-preview";
import { TemplatePicker } from "@/components/templates/template-picker";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/components/access/access-provider";
import { getDocument, getProfile, setDocumentTemplate, updateSettings } from "@/lib/db";
import type { BusinessProfile, DocumentRecord, TemplateId } from "@/lib/types";

type Loaded =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "ready"; doc: DocumentRecord; profile: BusinessProfile };

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

  const { access } = useAccess();
  if (loaded.state === "loading" || !access) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;

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

  return <DocumentView key={loaded.doc.id} initialDoc={loaded.doc} profile={loaded.profile} isPro={access.isPro} />;
}

function DocumentView({ initialDoc, profile, isPro }: { initialDoc: DocumentRecord; profile: BusinessProfile; isPro: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const template = getTemplate(doc.templateId, isPro);
  const Template = template.Component;
  const showFooterBrand = !isPro;

  async function changeTemplate(templateId: TemplateId) {
    setDoc((d) => ({ ...d, templateId }));
    await Promise.all([setDocumentTemplate(doc.id, templateId), updateSettings({ lastTemplate: templateId })]);
  }

  return (
    <>
      <PageHeader title={doc.number} backHref="/history" />
      <div className="flex flex-col gap-4">
        {canMarkPaid(doc) && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-secondary p-3">
            <p className="flex-1 text-sm">Has the customer paid? Turn this invoice into a receipt.</p>
            <Button size="sm" onClick={() => setMarkPaidOpen(true)}>
              <CheckCircle2 /> Mark as paid
            </Button>
          </div>
        )}
        {doc.receiptId && (
          <p className="rounded-xl bg-muted p-3 text-sm">
            Paid. <Link className="font-semibold text-primary underline" href={`/view?id=${doc.receiptId}`}>Open the receipt</Link>
          </p>
        )}
        {doc.sourceInvoiceId && (
          <p className="rounded-xl bg-muted p-3 text-sm">
            Receipt for invoice{" "}
            <Link className="font-semibold text-primary underline" href={`/view?id=${doc.sourceInvoiceId}`}>
              {doc.sourceInvoiceNumber}
            </Link>
          </p>
        )}
        <TemplatePicker
          value={template.id}
          onChange={changeTemplate}
          onLocked={() => router.push("/pro")}
          brandColor={profile.brandColor}
          isPro={isPro}
        />
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
          <Button asChild variant="ghost">
            <Link href={doc.type === "invoice" ? "/create?type=invoice" : "/create"}>
              <Plus /> New {doc.type}
            </Link>
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
      {canMarkPaid(doc) && <MarkPaidDialog doc={doc} open={markPaidOpen} onOpenChange={setMarkPaidOpen} />}
      <DeleteDialog doc={doc} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={() => router.push("/history")} />

      {/* Full-size copy, off screen, used to make the image and PDF. */}
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
        <div ref={exportRef} style={{ width: template.width }}>
          <Template doc={doc} profile={profile} showFooterBrand={showFooterBrand} />
        </div>
      </div>
    </>
  );
}
