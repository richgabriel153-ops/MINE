"use client";

import { useState, type RefObject } from "react";
import { Download, FileDown, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePreparedImage } from "@/hooks/use-prepared-image";
import { encodePng, extensionFor, formatFileSize } from "@/lib/export-image";
import { exportFileName, shareMessage, whatsappLink } from "@/lib/share-message";
import { downloadBlob, shareFile } from "@/lib/share";
import type { BusinessProfile, DocumentRecord } from "@/lib/types";

export function ShareBar({
  doc,
  profile,
  exportRef,
  renderKey,
  payLink,
  onShared,
}: {
  doc: DocumentRecord;
  profile: BusinessProfile;
  exportRef: RefObject<HTMLDivElement | null>;
  /** Changes whenever what's drawn changes (e.g. a different template). */
  renderKey: string;
  /** Pay Now link to include in the message and PDF. */
  payLink?: string | null;
  /** Called after the document was shared or downloaded (e.g. to mark a quote as Sent). */
  onShared?: () => void;
}) {
  const prepared = usePreparedImage(exportRef, renderKey);
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const message = shareMessage(doc, profile, payLink);
  const kind = doc.type === "quote" ? (doc.quoteTitle === "proforma" ? "proforma invoice" : "quote") : doc.type;

  async function onShare() {
    if (prepared?.status !== "ready") return;
    const { image } = prepared;
    const file = new File([image.blob], exportFileName(doc, profile, extensionFor(image.type)), { type: image.type });
    const result = await shareFile(file, message);
    if (result !== "cancelled") onShared?.();
    if (result === "unsupported") {
      // No share sheet with files (e.g. some desktop browsers): save the image, then open WhatsApp.
      downloadBlob(file, file.name);
      setFallbackOpen(true);
    }
  }

  async function onDownloadPng() {
    if (prepared?.status !== "ready") return;
    setBusy("png");
    try {
      const png = await encodePng(prepared.canvas);
      downloadBlob(png.blob, exportFileName(doc, profile, "png"));
      onShared?.();
      toast.success(`Image saved (${formatFileSize(png.blob.size)})`);
    } catch {
      toast.error("Could not save the image. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onDownloadPdf() {
    if (prepared?.status !== "ready") return;
    setBusy("pdf");
    try {
      const { canvasToPdf } = await import("@/lib/export-pdf");
      const pdf = await canvasToPdf(prepared.canvas, payLink);
      downloadBlob(pdf, exportFileName(doc, profile, "pdf"));
      onShared?.();
      toast.success(`PDF saved (${formatFileSize(pdf.size)})`);
    } catch {
      toast.error("Could not make the PDF. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const ready = prepared?.status === "ready";
  const failed = prepared?.status === "error";

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" className="w-full bg-[#1fa855] hover:bg-[#1b9a4d]" onClick={onShare} disabled={!ready}>
        {ready ? <MessageCircle /> : <Loader2 className="animate-spin" />}
        {ready ? `Send ${kind === "proforma invoice" ? "proforma" : kind} on WhatsApp` : failed ? "Image not ready" : "Getting image ready…"}
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={onDownloadPng} disabled={!ready || busy !== null}>
          {busy === "png" ? <Loader2 className="animate-spin" /> : <Download />} Image
        </Button>
        <Button variant="outline" onClick={onDownloadPdf} disabled={!ready || busy !== null}>
          {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        {ready
          ? `Image size: ${formatFileSize(prepared.image.blob.size)}`
          : failed
            ? "Something went wrong making the image. Reload the page to try again."
            : " "}
      </p>

      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Image saved</DialogTitle>
            <DialogDescription>
              Your {kind} image is in your downloads. Open WhatsApp, then tap the 📎 (attach) button and choose the
              image.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button asChild size="lg" className="bg-[#1fa855] hover:bg-[#1b9a4d]">
              <a href={whatsappLink(doc, message)} target="_blank" rel="noopener noreferrer" onClick={() => setFallbackOpen(false)}>
                <MessageCircle /> Open WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
