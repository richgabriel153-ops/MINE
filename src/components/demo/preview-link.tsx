"use client";

import Link from "next/link";
import { ChevronRight, FlaskConical } from "lucide-react";

import { usePreviewMode } from "@/lib/preview";

/** "Preview Pro" entry, shown only on test (preview) links. */
export function PreviewLink() {
  const mode = usePreviewMode();
  if (!mode?.enabled) return null;
  return (
    <Link
      href="/demo"
      className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-secondary px-4 py-3 shadow-xs active:bg-muted"
    >
      <FlaskConical className="size-6 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Preview all Pro features</span>
        <span className="block text-sm text-muted-foreground">Test link only · sample data, no payment</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </Link>
  );
}
