export type DocType = "receipt" | "invoice";
export type PaymentStatus = "paid" | "part" | "unpaid";
export type PaymentMethod = "transfer" | "cash" | "pos";
export type TemplateId = "classic" | "modern" | "compact";

export interface LineItem {
  id: string;
  description: string;
  /** Quantity, up to 2 decimal places (e.g. 1.5 yards). */
  quantity: number;
  unitPriceKobo: number;
}

export type Discount =
  | { type: "amount"; kobo: number }
  | { type: "percent"; percent: number };

export interface Customer {
  name: string;
  /** Normalised as +234XXXXXXXXXX, or "" when not given. */
  phone: string;
}

export interface DocumentRecord {
  id: string;
  schemaVersion: 1;
  type: DocType;
  /** e.g. RCT-0001 / INV-0001 */
  number: string;
  /** YYYY-MM-DD in Africa/Lagos */
  issueDate: string;
  /** YYYY-MM-DD, invoices only */
  dueDate: string | null;
  customer: Customer;
  items: LineItem[];
  discount: Discount | null;
  deliveryKobo: number;
  vatEnabled: boolean;
  status: PaymentStatus;
  /** Only used when status is "part". */
  amountPaidKobo: number;
  method: PaymentMethod;
  notes: string;
  templateId: TemplateId;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
  /** For a receipt created by marking an invoice as paid. */
  sourceInvoiceId?: string;
  sourceInvoiceNumber?: string;
  /** For an invoice that was marked as paid. */
  receiptId?: string;
}

/** What the create form edits: everything except fields the app assigns. */
export type DocumentDraft = Omit<DocumentRecord, "id" | "schemaVersion" | "number" | "createdAt" | "updatedAt">;

export interface BusinessProfile {
  name: string;
  /** data: URL of a compressed logo, or "" */
  logo: string;
  phone: string;
  whatsapp: string;
  address: string;
  email: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instagram: string;
  brandColor: string;
}

export const EMPTY_PROFILE: BusinessProfile = {
  name: "",
  logo: "",
  phone: "",
  whatsapp: "",
  address: "",
  email: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  instagram: "",
  brandColor: "#0b7a4b",
};
