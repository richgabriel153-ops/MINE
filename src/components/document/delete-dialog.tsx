"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteDocument } from "@/lib/db";
import type { DocumentRecord } from "@/lib/types";

export function DeleteDialog({
  doc,
  open,
  onOpenChange,
  onDeleted,
}: {
  doc: DocumentRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await deleteDocument(doc.id);
      toast.success(`${doc.number} deleted`);
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete. Please try again.");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {doc.number}?</DialogTitle>
          <DialogDescription>
            This removes it from this phone for good. Its number won&apos;t be used again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" size="lg" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
