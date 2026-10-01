/** Free version shows only the newest documents in History (older ones stay saved and in backups). */
export const FREE_HISTORY_LIMIT = 50;

export const PRO_BENEFITS = [
  { title: "Your brand only", text: "Remove the “Made with InCeipt” line from every receipt and invoice." },
  { title: "2 premium templates", text: "Bold and Elegant designs, on top of the 3 free ones." },
  { title: "Unlimited history", text: `Search all your records, not just the latest ${FREE_HISTORY_LIMIT}.` },
] as const;

/** Free vs Pro, row by row, for the comparison table. true = included. */
export const PRO_COMPARISON: { feature: string; free: string | boolean; pro: string | boolean }[] = [
  { feature: "Receipts & invoices", free: "Unlimited", pro: "Unlimited" },
  { feature: "Send on WhatsApp, PNG & PDF", free: true, pro: true },
  { feature: "Templates", free: "3", pro: "5" },
  { feature: "“Made with InCeipt” line", free: "Shown", pro: "Removed" },
  { feature: "History you can see", free: `Latest ${FREE_HISTORY_LIMIT}`, pro: "Everything" },
  { feature: "Sales summary & backup", free: true, pro: true },
];

/** The Paystack payment link, set in the NEXT_PUBLIC_PRO_PAYMENT_LINK environment variable. */
export function paymentLink(): string | null {
  const link = process.env.NEXT_PUBLIC_PRO_PAYMENT_LINK?.trim();
  return link && /^https:\/\//.test(link) ? link : null;
}

/** Optional price text shown on the Pro page, e.g. "₦5,000 one-time" (NEXT_PUBLIC_PRO_PRICE_LABEL). */
export function priceLabel(): string | null {
  return process.env.NEXT_PUBLIC_PRO_PRICE_LABEL?.trim() || null;
}
