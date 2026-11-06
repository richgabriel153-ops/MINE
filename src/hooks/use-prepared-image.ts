"use client";

import { useEffect, useState, type RefObject } from "react";

import { encodeForSharing, renderToCanvas, type EncodedImage } from "@/lib/export-image";

type Prepared =
  | { key: string; status: "ready"; canvas: HTMLCanvasElement; image: EncodedImage }
  | { key: string; status: "error" };

/**
 * Turns the hidden full-size template into an image as soon as the page shows (and again when
 * the template changes). Sharing must happen right after a tap, so the image has to be ready first.
 */
export function usePreparedImage(nodeRef: RefObject<HTMLElement | null>, key: string) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const node = nodeRef.current;
      if (!node) return;
      try {
        await Promise.all(Array.from(node.querySelectorAll("img"), (img) => img.decode().catch(() => undefined)));
        const canvas = await renderToCanvas(node);
        const image = await encodeForSharing(canvas);
        if (!cancelled) setPrepared({ key, status: "ready", canvas, image });
      } catch (err) {
        console.error(err);
        if (!cancelled) setPrepared({ key, status: "error" });
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nodeRef, key]);

  // Anything prepared for an older key is out of date.
  return prepared && prepared.key === key ? prepared : null;
}
