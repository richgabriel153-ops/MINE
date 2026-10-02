/** InCeipt brand colours (matte indigo with a muted amber accent). */
export const BRAND = {
  /** Main colour: buttons, links, default receipt colour. */
  indigo: "#3e4580",
  /** Near-black ink for dark panels. */
  ink: "#1c1e33",
  /** Muted amber for Pro and highlights. */
  amber: "#d9a441",
  /** Text on amber. */
  onAmber: "#33250a",
} as const;

/** The old default receipt colour (green). Profiles still on it move to the new default. */
export const OLD_DEFAULT_BRAND_COLOR = "#0b7a4b";
