/** Free version shows only the newest documents in History (older ones stay saved and in backups). */
export const FREE_HISTORY_LIMIT = 50;

export const PRO_BENEFITS = [
  { title: "InCeipt Assistant (AI)", text: "Just type “Receipt for Ada, 2 bags of rice at ₦45,000” and it's done for you." },
  { title: "Tax accountant", text: "Income tax and VAT worked out under the Nigeria Tax Act 2025, with deadlines and a tax report." },
  { title: "Track who owes you", text: "Record part payments and see every outstanding balance." },
  { title: "Pay Now links", text: "Customers pay invoices online by card, transfer or USSD. Invoices update themselves." },
  { title: "Quotations & proforma invoices", text: "Send quotes and turn them into invoices in one tap." },
  { title: "Expenses & profit", text: "Log what you spend and see your real profit by day, week or month." },
  { title: "Staff accounts", text: "Let your team make receipts while you control edits, totals and settings." },
  { title: "Your brand only, 5 templates", text: "No “Made with InCeipt” line, plus Bold and Elegant designs." },
] as const;

/** Free vs Pro, row by row, for the comparison table. true = included. */
export const PRO_COMPARISON: { feature: string; free: string | boolean; pro: string | boolean }[] = [
  { feature: "Receipts & invoices", free: "Unlimited", pro: "Unlimited" },
  { feature: "Send on WhatsApp, PNG & PDF", free: true, pro: true },
  { feature: "Part payments & money owed", free: false, pro: true },
  { feature: "Pay Now links on invoices", free: false, pro: true },
  { feature: "Quotations", free: false, pro: true },
  { feature: "Expenses & profit", free: false, pro: true },
  { feature: "Staff accounts", free: false, pro: true },
  { feature: "AI assistant", free: false, pro: true },
  { feature: "Tax estimates & report", free: false, pro: true },
  { feature: "Templates", free: "3", pro: "5" },
  { feature: "“Made with InCeipt” line", free: "Shown", pro: "Removed" },
  { feature: "History you can see", free: `Latest ${FREE_HISTORY_LIMIT}`, pro: "Everything" },
];
