/** Pick black or white text for a background colour so it stays readable. */
export function readableTextOn(hex: string): "#ffffff" | "#111827" {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#111827" : "#ffffff";
}

/** The brand colour, darkened if it's too light to read as text on white. */
export function brandTextColour(hex: string): string {
  return readableTextOn(hex) === "#111827" ? "#374151" : hex;
}

/** Hex colour with an alpha channel, e.g. a soft tint for backgrounds. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
