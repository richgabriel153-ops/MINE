/**
 * Shrink an uploaded logo so it stays small on the device and in shared images.
 * Returns a data: URL (WebP where the browser supports encoding it, otherwise PNG),
 * keeping transparency.
 */
export async function compressLogo(file: File, maxSide = 400): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a picture file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read this picture.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.9);
}

/** Shrink a receipt photo for an expense: JPEG, longest side 1280px, usually 100–250 KB. */
export async function compressPhoto(file: File, maxSide = 1280): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a picture file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read this picture.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read this picture."))), "image/jpeg", 0.72),
  );
}
