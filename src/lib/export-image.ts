import { getFontEmbedCSS, toCanvas } from "html-to-image";

import { isIOS } from "./device";

/** Shared images should stay under this so they send quickly on slow data. */
export const MAX_SHARE_BYTES = 300 * 1024;

/** Templates are drawn at 2× their CSS size: a 540px template becomes a sharp 1080px image. */
export const EXPORT_PIXEL_RATIO = 2;

export type ImageType = "image/png" | "image/jpeg";

export interface EncodedImage {
  blob: Blob;
  type: ImageType;
  width: number;
  height: number;
}

let fontCssPromise: Promise<string> | null = null;

/** Draw a template DOM node onto a canvas at high resolution. */
export async function renderToCanvas(node: HTMLElement): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  fontCssPromise ??= getFontEmbedCSS(node).catch(() => "");
  const options = {
    pixelRatio: EXPORT_PIXEL_RATIO,
    backgroundColor: "#ffffff",
    fontEmbedCSS: await fontCssPromise,
    skipAutoScale: true,
  };
  // Safari sometimes leaves out images and fonts on the first pass; a warm-up render fixes it.
  if (isIOS()) await toCanvas(node, options);
  return toCanvas(node, options);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: ImageType, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), type, quality),
  );
}

function scaleCanvas(source: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * factor);
  canvas.height = Math.round(source.height * factor);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function encode(canvas: HTMLCanvasElement, type: ImageType, quality?: number): Promise<EncodedImage> {
  return { blob: await canvasToBlob(canvas, type, quality), type, width: canvas.width, height: canvas.height };
}

/**
 * The image we share: PNG when it is small enough (sharpest text), otherwise JPEG,
 * stepping quality down until it fits under 300 KB.
 */
export async function encodeForSharing(canvas: HTMLCanvasElement): Promise<EncodedImage> {
  const png = await encode(canvas, "image/png");
  if (png.blob.size <= MAX_SHARE_BYTES) return png;
  let best = png;
  for (const quality of [0.9, 0.82, 0.74, 0.66]) {
    best = await encode(canvas, "image/jpeg", quality);
    if (best.blob.size <= MAX_SHARE_BYTES) return best;
  }
  // Very long receipts: make it a little smaller too.
  return encode(scaleCanvas(canvas, 0.75), "image/jpeg", 0.74);
}

/** A PNG download, scaled down a little if needed to stay under 300 KB. */
export async function encodePng(canvas: HTMLCanvasElement): Promise<EncodedImage> {
  let image = await encode(canvas, "image/png");
  for (const factor of [0.8, 0.65, 0.55]) {
    if (image.blob.size <= MAX_SHARE_BYTES) break;
    image = await encode(scaleCanvas(canvas, factor), "image/png");
  }
  return image;
}

export function extensionFor(type: ImageType): "png" | "jpg" {
  return type === "image/png" ? "png" : "jpg";
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
