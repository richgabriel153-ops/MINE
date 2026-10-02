import { EMPTY_PROFILE, type BusinessProfile, type DocumentRecord } from "./types";

/** Example data for the landing page preview. */
export const SAMPLE_PROFILE: BusinessProfile = {
  ...EMPTY_PROFILE,
  name: "Ada's Fashion House",
  phone: "+2348031234567",
  address: "Shop 12, Balogun Market, Lagos",
  instagram: "adasfashion",
  bankName: "GTBank",
  accountName: "Ada's Fashion House",
  accountNumber: "0123456789",
  brandColor: "#3e4580",
};

export const SAMPLE_RECEIPT: DocumentRecord = {
  id: "sample",
  schemaVersion: 1,
  type: "receipt",
  number: "RCT-0024",
  issueDate: "2026-10-01",
  dueDate: null,
  customer: { name: "Mrs Bisi Adeyemi", phone: "+2348123456789" },
  items: [
    { id: "1", description: "Ankara gown (custom fit)", quantity: 1, unitPriceKobo: 2_500_000 },
    { id: "2", description: "Aso-oke gele", quantity: 2, unitPriceKobo: 750_000 },
    { id: "3", description: "Lace fabric (yards)", quantity: 1.5, unitPriceKobo: 600_000 },
  ],
  discount: { type: "amount", kobo: 200_000 },
  deliveryKobo: 250_000,
  vatEnabled: false,
  status: "part",
  amountPaidKobo: 3_000_000,
  method: "transfer",
  notes: "No refund after 3 days. Thank you for your patronage!",
  templateId: "classic",
  createdAt: "",
  updatedAt: "",
};
