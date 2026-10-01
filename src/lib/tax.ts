/**
 * Tax estimates under the Nigeria Tax Act 2025 (in force from 1 January 2026).
 *
 * These are estimates to help a small business plan and prepare. They are not professional tax
 * advice: capital allowances, withholding tax credits, exempt income and other adjustments are
 * not modelled. Every rate is kept here, in one place, so it is easy to update when the law changes.
 */
import { percentOfKobo } from "./money";
import type { DatedAmount } from "./profit";
import { computeTotals } from "./totals";
import type { DocumentRecord } from "./types";

/** First year these rules apply to. */
export const TAX_RULES_FROM_YEAR = 2026;

/**
 * Small company / small business test. The Nigeria Tax Administration Act uses ₦100m turnover;
 * the Nigeria Tax Act prints ₦50m, which the reform committee has said is a typo for ₦100m.
 */
export const SMALL_TURNOVER_LIMIT_KOBO = 100_000_000 * 100;
export const SMALL_FIXED_ASSETS_LIMIT_KOBO = 250_000_000 * 100;
export const CIT_PERCENT = 30;
export const DEVELOPMENT_LEVY_PERCENT = 4;
export const VAT_RATE_PERCENT = 7.5;
export const RENT_RELIEF_PERCENT = 20;
export const RENT_RELIEF_CAP_KOBO = 500_000 * 100;

/** Personal income tax bands on chargeable income (sole traders, partners). */
export const PIT_BANDS: { upToKobo: number | null; percent: number }[] = [
  { upToKobo: 800_000 * 100, percent: 0 },
  { upToKobo: 3_000_000 * 100, percent: 15 },
  { upToKobo: 12_000_000 * 100, percent: 18 },
  { upToKobo: 25_000_000 * 100, percent: 21 },
  { upToKobo: 50_000_000 * 100, percent: 23 },
  { upToKobo: null, percent: 25 },
];

export type BusinessKind = "sole" | "company";

/** What the owner tells us about the business (kept on this phone). */
export interface TaxProfile {
  kind: BusinessKind;
  /** Lawyers, accountants, consultants, etc. can never be a "small" business. */
  professionalServices: boolean;
  fixedAssetsKobo: number;
  /** Sole traders: rent paid on their home in the year (for rent relief). */
  rentPaidKobo: number;
  /** Sole traders: pension contributions in the year. */
  pensionKobo: number;
  /** Business income not recorded in InCeipt. */
  otherIncomeKobo: number;
  /** Business costs not recorded in InCeipt. */
  extraExpensesKobo: number;
  /** Expense categories that aren't business costs (e.g. personal spending). */
  excludedCategories: string[];
}

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  kind: "sole",
  professionalServices: false,
  fixedAssetsKobo: 0,
  rentPaidKobo: 0,
  pensionKobo: 0,
  otherIncomeKobo: 0,
  extraExpensesKobo: 0,
  excludedCategories: [],
};

export interface TaxInputs {
  year: number;
  /** Money received, by day. */
  sales: DatedAmount[];
  expenses: (DatedAmount & { category: string })[];
  /** VAT charged on receipts/invoices, by issue date. */
  outputVat: DatedAmount[];
}

export interface PitBandLine {
  label: string;
  percent: number;
  taxableKobo: number;
  taxKobo: number;
}

export interface VatMonth {
  month: string; // YYYY-MM
  vatKobo: number;
  dueDate: string; // YYYY-MM-DD
}

export interface TaxDeadline {
  label: string;
  date: string;
}

export interface TaxReport {
  year: number;
  kind: BusinessKind;
  grossReceiptsKobo: number;
  outputVatKobo: number;
  /** Receipts without VAT, plus other income. */
  turnoverKobo: number;
  expensesKobo: number;
  excludedExpensesKobo: number;
  /** Turnover − allowable expenses. Can be negative (a loss). */
  profitKobo: number;
  small: boolean;
  /** Why the business is (or isn't) small. */
  smallReasons: string[];
  vat: { mustCharge: boolean; outputVatKobo: number; months: VatMonth[] };
  company: { citKobo: number; levyKobo: number } | null;
  personal: {
    rentReliefKobo: number;
    pensionKobo: number;
    chargeableKobo: number;
    bands: PitBandLine[];
  } | null;
  totalTaxKobo: number;
  /** Tax ÷ profit, in percent (0 when there's no profit). */
  effectiveRatePercent: number;
  deadlines: TaxDeadline[];
  notes: string[];
}

function inYear(entries: DatedAmount[], year: number): DatedAmount[] {
  const prefix = `${year}-`;
  return entries.filter((e) => e.date.startsWith(prefix));
}

const sum = (entries: { amountKobo: number }[]) => entries.reduce((s, e) => s + e.amountKobo, 0);

const nairaShort = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

/** Personal income tax on chargeable income, band by band. */
export function personalIncomeTax(chargeableKobo: number): PitBandLine[] {
  const lines: PitBandLine[] = [];
  let lower = 0;
  for (const band of PIT_BANDS) {
    const upper = band.upToKobo ?? Number.MAX_SAFE_INTEGER;
    const taxable = Math.max(0, Math.min(chargeableKobo, upper) - lower);
    const label =
      band.upToKobo === null ? `Above ${nairaShort(lower)}` : lower === 0 ? `First ${nairaShort(upper)}` : `Next ${nairaShort(upper - lower)}`;
    lines.push({ label, percent: band.percent, taxableKobo: taxable, taxKobo: percentOfKobo(taxable, band.percent) });
    if (chargeableKobo <= upper) break;
    lower = upper;
  }
  return lines;
}

export function computeTax(profile: TaxProfile, input: TaxInputs): TaxReport {
  const { year } = input;
  const grossReceipts = sum(inYear(input.sales, year));
  const outputVat = sum(inYear(input.outputVat, year));
  const turnover = Math.max(0, grossReceipts - outputVat) + Math.max(0, profile.otherIncomeKobo);

  const excluded = new Set(profile.excludedCategories);
  const yearExpenses = input.expenses.filter((e) => e.date.startsWith(`${year}-`));
  const excludedKobo = sum(yearExpenses.filter((e) => excluded.has(e.category)));
  const expenses = sum(yearExpenses) - excludedKobo + Math.max(0, profile.extraExpensesKobo);
  const profit = turnover - expenses;

  const smallReasons: string[] = [];
  const turnoverOk = turnover <= SMALL_TURNOVER_LIMIT_KOBO;
  const assetsOk = profile.fixedAssetsKobo <= SMALL_FIXED_ASSETS_LIMIT_KOBO;
  smallReasons.push(
    turnoverOk
      ? `Turnover is ${nairaShort(turnover)}, within the ${nairaShort(SMALL_TURNOVER_LIMIT_KOBO)} limit.`
      : `Turnover is ${nairaShort(turnover)}, above the ${nairaShort(SMALL_TURNOVER_LIMIT_KOBO)} limit.`,
  );
  smallReasons.push(
    assetsOk
      ? `Fixed assets are within the ${nairaShort(SMALL_FIXED_ASSETS_LIMIT_KOBO)} limit.`
      : `Fixed assets are above the ${nairaShort(SMALL_FIXED_ASSETS_LIMIT_KOBO)} limit.`,
  );
  if (profile.professionalServices) smallReasons.push("Professional services businesses can't be treated as small.");
  const small = turnoverOk && assetsOk && !profile.professionalServices;

  // VAT: a small business doesn't charge or file VAT. Others file monthly by the 21st.
  const vatByMonth = new Map<string, number>();
  for (const e of inYear(input.outputVat, year)) {
    const m = e.date.slice(0, 7);
    vatByMonth.set(m, (vatByMonth.get(m) ?? 0) + e.amountKobo);
  }
  const months: VatMonth[] = [...vatByMonth.entries()]
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vatKobo]) => ({ month, vatKobo, dueDate: vatDueDate(month) }));

  const assessable = Math.max(0, profit);
  let company: TaxReport["company"] = null;
  let personal: TaxReport["personal"] = null;
  let totalTax: number;
  const notes: string[] = [];

  if (profile.kind === "company") {
    const citKobo = small ? 0 : percentOfKobo(assessable, CIT_PERCENT);
    const levyKobo = small ? 0 : percentOfKobo(assessable, DEVELOPMENT_LEVY_PERCENT);
    company = { citKobo, levyKobo };
    totalTax = citKobo + levyKobo;
    if (small) notes.push("Small companies pay 0% company income tax and no development levy, but must still file a return.");
    else notes.push("Capital allowances on equipment and vehicles can lower the taxable profit. They aren't included here.");
  } else {
    const rentReliefKobo = Math.min(percentOfKobo(Math.max(0, profile.rentPaidKobo), RENT_RELIEF_PERCENT), RENT_RELIEF_CAP_KOBO);
    const pensionKobo = Math.max(0, profile.pensionKobo);
    const chargeableKobo = Math.max(0, assessable - rentReliefKobo - pensionKobo);
    const bands = personalIncomeTax(chargeableKobo);
    personal = { rentReliefKobo, pensionKobo, chargeableKobo, bands };
    totalTax = bands.reduce((s, b) => s + b.taxKobo, 0);
    notes.push("Sole traders pay personal income tax on business profit. The first ₦800,000 a year is tax free.");
    notes.push("Your State Internal Revenue Service collects this tax (not the Nigeria Revenue Service).");
  }

  if (profit < 0) notes.push("The business made a loss this year, so there's no income tax to pay. Keep records: losses can be carried forward.");
  if (!small && outputVat === 0)
    notes.push("Your turnover is above the VAT limit, but no VAT was added to your receipts or invoices. Turn on VAT when you create them.");
  if (small && outputVat > 0) notes.push("As a small business you don't have to charge VAT. You added VAT to some documents.");
  if (year < TAX_RULES_FROM_YEAR) notes.push(`These rules apply from ${TAX_RULES_FROM_YEAR}. Earlier years used different rules.`);

  const deadlines: TaxDeadline[] = [];
  if (profile.kind === "company") deadlines.push({ label: "Company income tax return", date: `${year + 1}-06-30` });
  else deadlines.push({ label: "Personal income tax return (self-assessment)", date: `${year + 1}-03-31` });
  if (!small) deadlines.push({ label: "VAT return and payment: every month", date: "21st of the next month" });

  return {
    year,
    kind: profile.kind,
    grossReceiptsKobo: grossReceipts,
    outputVatKobo: outputVat,
    turnoverKobo: turnover,
    expensesKobo: expenses,
    excludedExpensesKobo: excludedKobo,
    profitKobo: profit,
    small,
    smallReasons,
    vat: { mustCharge: !small, outputVatKobo: outputVat, months },
    company,
    personal,
    totalTaxKobo: totalTax,
    effectiveRatePercent: assessable > 0 ? Math.round((totalTax / assessable) * 1000) / 10 : 0,
    deadlines,
    notes,
  };
}

/** VAT for a month is due on the 21st of the next month. */
export function vatDueDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-21`;
}

/** VAT charged on each receipt/invoice, by its date. Quotes and invoices already turned into receipts are skipped. */
export function outputVatFromDocuments(docs: DocumentRecord[]): DatedAmount[] {
  return docs
    .filter((d) => d.type !== "quote" && !(d.type === "invoice" && d.receiptId))
    .map((d) => ({ date: d.issueDate, amountKobo: computeTotals(d).vatKobo }))
    .filter((e) => e.amountKobo > 0);
}

/** Years that have records, plus this year, from 2026 on. Newest first. */
export function taxYears(dates: string[], today: string): number[] {
  const years = new Set<number>([Number(today.slice(0, 4))]);
  for (const d of dates) years.add(Number(d.slice(0, 4)));
  return [...years].filter((y) => y >= TAX_RULES_FROM_YEAR).sort((a, b) => b - a);
}
