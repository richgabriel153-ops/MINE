/**
 * Details shown on the Privacy, Terms and Refund pages. Set them in Vercel (they're public):
 *   NEXT_PUBLIC_LEGAL_NAME       registered business name, e.g. "InCeipt Technologies Ltd" or "John Doe trading as InCeipt"
 *   NEXT_PUBLIC_SUPPORT_EMAIL    where users and customers can reach you
 *   NEXT_PUBLIC_SUPPORT_PHONE    optional
 *   NEXT_PUBLIC_BUSINESS_ADDRESS optional but recommended (Paystack checks it)
 */
export const LEGAL = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || "InCeipt",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "",
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "",
  effective: "1 October 2026",
};

export const LEGAL_PAGES = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund Policy" },
] as const;
