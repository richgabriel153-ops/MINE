import { formatNaira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import { VAT_PERCENT, type Totals } from "@/lib/totals";
import type { BusinessProfile, DocumentRecord, PaymentMethod, PaymentStatus } from "@/lib/types";

/** Templates are drawn at this width (CSS px) and exported at 2× for sharp 1080px images. */
export const TEMPLATE_WIDTH = 540;

/** Same as the app font, spelled out so exported images use it too. */
export const TEMPLATE_FONT = "var(--font-inter), var(--font-naira), Roboto, Arial, sans-serif";

export interface TemplateProps {
  doc: DocumentRecord;
  profile: BusinessProfile;
  /** Free version shows "Made with ReceiptNaija". */
  showFooterBrand: boolean;
}

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "PAID",
  part: "PART PAID",
  unpaid: "UNPAID",
};

export const STATUS_COLOUR: Record<PaymentStatus, string> = {
  paid: "#0b7a4b",
  part: "#b45309",
  unpaid: "#b91c1c",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS",
};

/** Contact lines for the header, skipping empty ones. */
export function contactLines(p: BusinessProfile): string[] {
  const phones = [p.phone, p.whatsapp].filter(Boolean);
  const uniquePhones = [...new Set(phones)];
  const lines: string[] = [];
  if (p.address) lines.push(p.address);
  const phoneLine = uniquePhones
    .map((ph) => (ph === p.whatsapp && ph !== p.phone ? `WhatsApp ${formatNgPhone(ph)}` : formatNgPhone(ph)))
    .join(" · ");
  const extra = [phoneLine, p.instagram && `IG @${p.instagram}`].filter(Boolean).join(" · ");
  if (extra) lines.push(extra);
  if (p.email) lines.push(p.email);
  return lines;
}

export function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, "");
}

export interface TotalRow {
  label: string;
  value: string;
}

/** Subtotal / discount / VAT / delivery lines, skipping the ones that are zero. */
export function breakdownRows(doc: DocumentRecord, totals: Totals): TotalRow[] {
  const rows: TotalRow[] = [{ label: "Subtotal", value: formatNaira(totals.subtotalKobo) }];
  if (totals.discountKobo > 0)
    rows.push({
      label: doc.discount?.type === "percent" ? `Discount (${doc.discount.percent}%)` : "Discount",
      value: `-${formatNaira(totals.discountKobo)}`,
    });
  if (totals.vatKobo > 0) rows.push({ label: `VAT (${VAT_PERCENT}%)`, value: formatNaira(totals.vatKobo) });
  if (totals.deliveryKobo > 0) rows.push({ label: "Delivery", value: formatNaira(totals.deliveryKobo) });
  return rows;
}

/** Bank details show on invoices that still need paying. */
export function showsBankDetails(doc: DocumentRecord, profile: BusinessProfile): boolean {
  return doc.type === "invoice" && doc.status !== "paid" && profile.bankName.trim() !== "" && profile.accountNumber.trim() !== "";
}
