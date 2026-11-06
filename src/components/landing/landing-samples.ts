import { SAMPLE_PROFILE as BASE_PROFILE, SAMPLE_RECEIPT as BASE_RECEIPT } from "@/lib/sample";
import type { BusinessProfile, DocumentRecord, TemplateId } from "@/lib/types";

/** Three example sellers for the landing page, each in its own brand colour and receipt design. */
// No phone numbers on the public page: they would look like real people's numbers.
const SAMPLE_PROFILE: BusinessProfile = { ...BASE_PROFILE, phone: "", whatsapp: "" };
const SAMPLE_RECEIPT: DocumentRecord = { ...BASE_RECEIPT, customer: { ...BASE_RECEIPT.customer, phone: "" } };

export interface SampleSet {
  key: string;
  profile: BusinessProfile;
  doc: DocumentRecord;
  template: TemplateId;
  customer: string;
  status: "paid" | "part" | "unpaid";
  /** Short line under the amount when there is no balance to show. */
  note: string;
}

const kitchen: BusinessProfile = {
  ...SAMPLE_PROFILE,
  name: "Mama Chi Kitchen",
  address: "Adeola Odeku Street, Victoria Island",
  instagram: "mamachikitchen",
  accountName: "Mama Chi Kitchen",
  brandColor: "#c2410c",
};

const gadgets: BusinessProfile = {
  ...SAMPLE_PROFILE,
  name: "Tunde Gadgets",
  address: "Computer Village, Ikeja",
  instagram: "tundegadgets",
  accountName: "Tunde Gadgets",
  brandColor: "#1d4e89",
};

export const SAMPLE_SETS: SampleSet[] = [
  {
    key: "fashion",
    profile: SAMPLE_PROFILE,
    doc: SAMPLE_RECEIPT,
    template: "classic",
    customer: "Mrs Bisi Adeyemi",
    status: "part",
    note: "",
  },
  {
    key: "kitchen",
    profile: kitchen,
    template: "modern",
    customer: "Ada Okafor",
    status: "paid",
    note: "Paid by transfer",
    doc: {
      ...SAMPLE_RECEIPT,
      id: "sample-kitchen",
      number: "RCT-0112",
      customer: { name: "Ada Okafor", phone: "" },
      items: [
        { id: "1", description: "Jollof rice tray (50 portions)", quantity: 1, unitPriceKobo: 8_500_000 },
        { id: "2", description: "Small chops pack", quantity: 30, unitPriceKobo: 250_000 },
        { id: "3", description: "Chapman (5 litres)", quantity: 1, unitPriceKobo: 1_000_000 },
      ],
      discount: null,
      deliveryKobo: 0,
      status: "paid",
      amountPaidKobo: 0,
      notes: "Thank you for your patronage!",
      templateId: "modern",
    },
  },
  {
    key: "gadgets",
    profile: gadgets,
    template: "compact",
    customer: "Emeka Obi",
    status: "unpaid",
    note: "Due Friday",
    doc: {
      ...SAMPLE_RECEIPT,
      id: "sample-gadgets",
      type: "invoice",
      number: "INV-0031",
      dueDate: "2026-10-08",
      customer: { name: "Emeka Obi", phone: "" },
      items: [
        { id: "1", description: "Tecno Spark 30", quantity: 1, unitPriceKobo: 18_500_000 },
        { id: "2", description: "Screen guard and case", quantity: 1, unitPriceKobo: 1_500_000 },
        { id: "3", description: "Fast charger", quantity: 1, unitPriceKobo: 1_500_000 },
      ],
      discount: null,
      deliveryKobo: 0,
      status: "unpaid",
      amountPaidKobo: 0,
      notes: "Pay into the account below. Thank you!",
      templateId: "compact",
    },
  },
];
