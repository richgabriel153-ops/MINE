import { isIOS } from "./device";

export type ShareResult = "shared" | "cancelled" | "unsupported";

/** Open the phone's share sheet with the image attached (Android Chrome, iPhone Safari). */
export async function shareFile(file: File, text: string): Promise<ShareResult> {
  if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] })) return "unsupported";
  try {
    // WhatsApp on iPhone can drop the picture when text comes with it, so send the picture alone there.
    await navigator.share(isIOS() ? { files: [file] } : { files: [file], text });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}

/** Save a file to the device's downloads. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
