"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { useAccess } from "@/components/access/access-provider";
import { DeleteDialog } from "@/components/document/delete-dialog";
import { canMarkPaid, MarkPaidDialog } from "@/components/document/mark-paid-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DocumentRecord } from "@/lib/types";

const itemClass =
  "flex h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-base font-medium hover:bg-muted active:bg-muted";

/** The ⋮ button on a history row, opening a sheet of big, thumb-friendly actions. */
export function DocumentActions({ doc, onChanged }: { doc: DocumentRecord; onChanged: () => void }) {
  const { access, showOwnerOnly } = useAccess();
  const [sheet, setSheet] = useState(false);
  const [markPaid, setMarkPaid] = useState(false);
  const [del, setDel] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground"
        aria-label={`More actions for ${doc.number}`}
        onClick={() => setSheet(true)}
      >
        <MoreVertical />
      </Button>

      <Dialog open={sheet} onOpenChange={setSheet}>
        <DialogContent className="gap-2 p-3 pt-5">
          <DialogHeader className="px-3 pb-1">
            <DialogTitle>{doc.number}</DialogTitle>
          </DialogHeader>
          <Link href={`/view?id=${doc.id}`} className={itemClass}>
            <Eye className="size-5 text-muted-foreground" /> Open and share
          </Link>
          {canMarkPaid(doc) && (
            <button
              type="button"
              className={`${itemClass} text-primary`}
              onClick={() => {
                setSheet(false);
                setMarkPaid(true);
              }}
            >
              <CheckCircle2 className="size-5" /> Mark as paid
            </button>
          )}
          {access?.can.editRecords ? (
            <Link href={`/create?edit=${doc.id}`} className={itemClass}>
              <Pencil className="size-5 text-muted-foreground" /> Edit
            </Link>
          ) : (
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                setSheet(false);
                showOwnerOnly("Only the business owner can edit past records. Make a copy instead if you need a new one.");
              }}
            >
              <Pencil className="size-5 text-muted-foreground" /> Edit
            </button>
          )}
          <Link href={`/create?duplicate=${doc.id}`} className={itemClass}>
            <Copy className="size-5 text-muted-foreground" /> Make a copy
          </Link>
          <button
            type="button"
            className={`${itemClass} text-destructive`}
            onClick={() => {
              setSheet(false);
              setDel(true);
            }}
          >
            <Trash2 className="size-5" /> Delete
          </button>
        </DialogContent>
      </Dialog>

      {canMarkPaid(doc) && <MarkPaidDialog doc={doc} open={markPaid} onOpenChange={setMarkPaid} />}
      <DeleteDialog doc={doc} open={del} onOpenChange={setDel} onDeleted={onChanged} />
    </>
  );
}
