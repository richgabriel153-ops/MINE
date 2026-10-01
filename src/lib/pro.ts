/** Free version shows only the newest documents in History (older ones stay saved and in backups). */
export const FREE_HISTORY_LIMIT = 50;

export const PRO_BENEFITS = [
  { title: "No “Made with ReceiptNaija” footer", text: "Receipts carry only your brand." },
  { title: "2 extra templates", text: "Bold and Elegant designs, on top of the 3 free ones." },
  { title: "Unlimited history", text: `See and search all your records, not just the latest ${FREE_HISTORY_LIMIT}.` },
] as const;

/** The Paystack payment link, set in the NEXT_PUBLIC_PRO_PAYMENT_LINK environment variable. */
export function paymentLink(): string | null {
  const link = process.env.NEXT_PUBLIC_PRO_PAYMENT_LINK?.trim();
  return link && /^https:\/\//.test(link) ? link : null;
}
