/** Sample records for the Pro preview (test links only). Saved on this phone like real records. */
import { addDays, lagosDate } from "./dates";
import * as local from "./local-db";
import type { DocumentDraft, PaymentMethod, PaymentStatus } from "./types";

type Item = [description: string, quantity: number, naira: number];

function draft(
  type: DocumentDraft["type"],
  issueDate: string,
  customer: [string, string],
  items: Item[],
  opts: { status?: PaymentStatus; paidNaira?: number; method?: PaymentMethod; vat?: boolean; dueDays?: number; deliveryNaira?: number; notes?: string } = {},
): DocumentDraft {
  const status = type === "quote" ? "unpaid" : (opts.status ?? (type === "receipt" ? "paid" : "unpaid"));
  return {
    type,
    issueDate,
    dueDate: type === "receipt" ? null : addDays(issueDate, opts.dueDays ?? (type === "quote" ? 14 : 7)),
    customer: { name: customer[0], phone: customer[1] },
    items: items.map(([description, quantity, naira], i) => ({ id: `demo-${issueDate}-${i}`, description, quantity, unitPriceKobo: naira * 100 })),
    discount: null,
    deliveryKobo: (opts.deliveryNaira ?? 0) * 100,
    vatEnabled: opts.vat ?? false,
    status,
    amountPaidKobo: status === "part" ? (opts.paidNaira ?? 0) * 100 : 0,
    method: opts.method ?? "transfer",
    notes: opts.notes ?? "Thank you for your patronage!",
    templateId: "classic",
    ...(type === "quote" ? { quoteTitle: "quotation" as const, quoteStatus: "sent" as const } : {}),
  };
}

/** True when this phone has no records yet (sample data is only added to an empty app). */
export async function canAddSampleData(): Promise<boolean> {
  return (await local.listDocuments()).length === 0 && (await local.listExpenses()).length === 0;
}

export async function addSampleData(): Promise<void> {
  const today = lagosDate();
  const d = (daysAgo: number) => addDays(today, -daysAgo);

  const profile = await local.getProfile();
  if (!profile.name) {
    await local.saveProfile({
      ...profile,
      name: "Mama Chi Kitchen",
      phone: "+2348031234567",
      whatsapp: "+2348031234567",
      address: "12 Adeola Odeku Street, Victoria Island, Lagos",
      bankName: "GTBank",
      accountName: "Mama Chi Kitchen",
      accountNumber: "0123456789",
      instagram: "mamachikitchen",
    });
  }

  const ada: [string, string] = ["Ada Okafor", "+2348051234567"];
  const tunde: [string, string] = ["Tunde Bakare", "+2348091112233"];
  const zainab: [string, string] = ["Zainab Events Ltd", "+2348129876543"];
  const emeka: [string, string] = ["Emeka Obi", ""];

  const docs: DocumentDraft[] = [
    draft("receipt", d(150), ada, [["Jollof rice tray (50 portions)", 2, 85_000], ["Chapman (5L)", 4, 12_000]]),
    draft("receipt", d(120), zainab, [["Wedding catering package", 1, 650_000]], { vat: true, deliveryNaira: 25_000 }),
    draft("receipt", d(95), emeka, [["Small chops pack", 60, 2_500]], { method: "cash" }),
    draft("receipt", d(70), tunde, [["Fried rice tray", 3, 80_000], ["Grilled chicken", 40, 3_500]], { method: "pos" }),
    draft("receipt", d(40), ada, [["Birthday party catering", 1, 420_000]]),
    draft("receipt", d(12), emeka, [["Office lunch packs", 35, 4_000]], { method: "transfer" }),
    draft("receipt", d(2), ada, [["Small chops pack", 80, 2_500]], { method: "transfer" }),
    draft("receipt", d(0), tunde, [["Jollof rice tray (50 portions)", 1, 85_000]], { status: "part", paidNaira: 50_000, method: "cash" }),
    draft("invoice", d(20), zainab, [["Corporate end-of-year dinner (200 guests)", 200, 9_500]], { vat: true, dueDays: 30, status: "part", paidNaira: 1_000_000 }),
    draft("invoice", d(18), tunde, [["Naming ceremony catering", 1, 350_000]], { dueDays: 7 }),
    draft("invoice", d(3), ada, [["Weekly meal prep (4 weeks)", 4, 45_000]], { dueDays: 14 }),
    draft("quote", d(5), zainab, [["Christmas party buffet (150 guests)", 150, 11_000], ["Drinks and service staff", 1, 300_000]], { vat: true }),
    draft("quote", d(1), emeka, [["Office lunch packs (monthly)", 400, 3_800]]),
  ];
  for (const doc of docs) await local.createDocument(doc);

  const expenses: [number, string, number, string][] = [
    [148, "Stock", 120_000, "Rice, oil and tomatoes, Mile 12"],
    [118, "Stock", 210_000, "Wedding ingredients"],
    [116, "Salaries", 150_000, "Extra cooks for wedding"],
    [90, "Rent", 250_000, "Kitchen rent (quarter)"],
    [72, "Stock", 140_000, "Chicken and rice"],
    [60, "Fuel", 45_000, "Generator diesel"],
    [41, "Stock", 160_000, "Party ingredients"],
    [30, "Salaries", 120_000, "Two kitchen assistants"],
    [25, "Transport", 18_000, "Delivery van"],
    [10, "Fuel", 38_000, "Generator diesel"],
    [6, "Utilities", 22_000, "Electricity token"],
    [1, "Transport", 9_500, "Delivery to Lekki"],
  ];
  for (const [daysAgo, category, naira, note] of expenses) {
    await local.saveExpense(null, { amountKobo: naira * 100, category, date: d(daysAgo), note });
  }
}
