import { formatNgPhone } from "@/lib/phone";
import type { BusinessProfile, DocumentRecord, PaymentMethod, PaymentStatus } from "@/lib/types";

/** Templates are drawn at this width (CSS px) and exported at 2× for sharp 1080px images. */
export const TEMPLATE_WIDTH = 540;

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
