"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { DocumentForm } from "@/components/document/document-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getDocument, getProfile, getSettings, peekNextNumber } from "@/lib/db";
import { duplicateForm, emptyForm, formFromRecord, type DocumentFormState } from "@/lib/document-form";
import type { BusinessProfile, DocType } from "@/lib/types";

type Loaded =
  | { state: "loading" }
  | { state: "missing" }
  | {
      state: "ready";
      form: DocumentFormState;
      number: string;
      profile: BusinessProfile;
      editingId?: string;
    };

export function CreateLoader() {
  const params = useSearchParams();
  const editId = params.get("edit");
  const duplicateId = params.get("duplicate");
  const type: DocType = params.get("type") === "invoice" ? "invoice" : "receipt";
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
      const sourceId = editId ?? duplicateId;
      let next: Loaded;
      if (sourceId) {
        const doc = await getDocument(sourceId);
        if (!doc) next = { state: "missing" };
        else if (editId)
          next = { state: "ready", form: formFromRecord(doc), number: doc.number, profile, editingId: doc.id };
        else next = { state: "ready", form: duplicateForm(doc), number: await peekNextNumber(doc.type), profile };
      } else {
        const form = { ...emptyForm(type), notes: settings.lastNotes, templateId: settings.lastTemplate };
        next = { state: "ready", form, number: await peekNextNumber(type), profile };
      }
      if (active) setLoaded(next);
    })();
    return () => {
      active = false;
    };
  }, [editId, duplicateId, type]);

  const title = editId ? "Edit" : duplicateId ? "Copy" : type === "invoice" ? "New invoice" : "New receipt";

  if (loaded.state === "loading")
    return (
      <>
        <PageHeader title={title} backHref="/home" />
        <p className="py-10 text-center text-muted-foreground">Loading…</p>
      </>
    );

  if (loaded.state === "missing")
    return (
      <>
        <PageHeader title={title} backHref="/home" />
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p>We couldn&apos;t find that document. It may have been deleted.</p>
          <Button asChild>
            <Link href="/create">Start a new receipt</Link>
          </Button>
        </div>
      </>
    );

  return (
    <>
      <PageHeader
        title={editId ? `Edit ${loaded.number}` : title}
        backHref={editId ? `/view?id=${editId}` : "/home"}
      />
      <DocumentForm
        // Remount when switching between new/edit/duplicate links.
        key={`${editId}-${duplicateId}-${type}`}
        initial={loaded.form}
        number={loaded.number}
        profile={loaded.profile}
        editingId={loaded.editingId}
      />
    </>
  );
}
