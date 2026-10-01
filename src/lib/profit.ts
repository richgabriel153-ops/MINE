import { addDays, startOfMonth, startOfWeek } from "./dates";

/** Money in or out on a day. */
export interface DatedAmount {
  date: string; // YYYY-MM-DD
  amountKobo: number;
}

export type PeriodKey = "today" | "week" | "month" | "custom";

export interface Range {
  from: string;
  to: string;
}

export function rangeFor(period: Exclude<PeriodKey, "custom">, today: string): Range {
  if (period === "today") return { from: today, to: today };
  if (period === "week") return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) };
  const from = startOfMonth(today);
  const [y, m] = today.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(nextMonth, -1) };
}

function sumIn(entries: DatedAmount[], r: Range): number {
  return entries.reduce((s, e) => (e.date >= r.from && e.date <= r.to ? s + e.amountKobo : s), 0);
}

export interface ProfitSummary {
  salesKobo: number;
  expensesKobo: number;
  profitKobo: number;
}

/** Sales = money actually received in the range. Profit = sales − expenses. Debts are not included. */
export function profitFor(sales: DatedAmount[], expenses: DatedAmount[], r: Range): ProfitSummary {
  const salesKobo = sumIn(sales, r);
  const expensesKobo = sumIn(expenses, r);
  return { salesKobo, expensesKobo, profitKobo: salesKobo - expensesKobo };
}

export interface MonthBar {
  month: string; // YYYY-MM
  salesKobo: number;
  expensesKobo: number;
}

/** The last `count` months up to and including today's month, oldest first. */
export function monthlySeries(sales: DatedAmount[], expenses: DatedAmount[], today: string, count = 6): MonthBar[] {
  const [y, m] = today.split("-").map(Number);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months.map((month) => ({
    month,
    salesKobo: sales.reduce((s, e) => (e.date.startsWith(month) ? s + e.amountKobo : s), 0),
    expensesKobo: expenses.reduce((s, e) => (e.date.startsWith(month) ? s + e.amountKobo : s), 0),
  }));
}

/** Expenses per category in a range, biggest first. */
export function byCategory(expenses: (DatedAmount & { category: string })[], r: Range): { category: string; amountKobo: number }[] {
  const totals = new Map<string, number>();
  for (const e of expenses) if (e.date >= r.from && e.date <= r.to) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountKobo);
  return [...totals].map(([category, amountKobo]) => ({ category, amountKobo })).sort((a, b) => b.amountKobo - a.amountKobo);
}

/** Clean axis ticks for ₦ amounts: 0 and 4 even steps up to a round maximum (kobo in, kobo out). */
export function niceTicks(maxKobo: number, steps = 4): number[] {
  const maxNaira = Math.max(1, Math.ceil(maxKobo / 100));
  const rough = maxNaira / steps;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  return Array.from({ length: steps + 1 }, (_, i) => Math.round(i * step * 100));
}

/** Short ₦ for axis labels: ₦0, ₦500, ₦25k, ₦1.5m */
export function shortNaira(kobo: number): string {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `₦${+(n / 1_000).toFixed(1)}k`;
  return `₦${Math.round(n)}`;
}
