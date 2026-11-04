/** InCeipt brand colours ("Lagoon": deep teal with a coral mark). */
export const BRAND = {
  /** Main colour: buttons, links, default receipt colour. */
  teal: "#0b5f5a",
  /** Near-black ink for text and dark panels. */
  ink: "#0e1d1c",
  /** Coral for the logo mark and Pro. Use ink text on it, never white. */
  coral: "#e86a33",
  /** Text on coral. */
  onCoral: "#0e1d1c",
} as const;

/** Earlier default receipt colours (green, then indigo). Profiles still on one of them move to the new default. */
export const OLD_DEFAULT_BRAND_COLORS = ["#0b7a4b", "#3e4580"] as const;

/** The new default if this colour was an old default, otherwise the colour unchanged. */
export function currentBrandColor(c: string | null | undefined): string {
  const v = (c ?? "").toLowerCase();
  return !v || (OLD_DEFAULT_BRAND_COLORS as readonly string[]).includes(v) ? BRAND.teal : (c as string);
}
