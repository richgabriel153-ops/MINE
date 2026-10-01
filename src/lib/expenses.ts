export const DEFAULT_EXPENSE_CATEGORIES = ["Stock", "Transport", "Fuel", "Rent", "Salaries", "Utilities", "Other"] as const;

export interface Expense {
  id: string;
  amountKobo: number;
  category: string;
  /** YYYY-MM-DD (Lagos) */
  date: string;
  note: string;
  /** Phone mode: compressed photo as a data: URL. */
  photo?: string;
  /** Account mode: path of the photo in storage. */
  photoPath?: string | null;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseDraft = Pick<Expense, "amountKobo" | "category" | "date" | "note">;

/** Default categories plus the owner's own, without duplicates (case-insensitive). */
export function allCategories(custom: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...DEFAULT_EXPENSE_CATEGORIES.slice(0, -1), ...custom, "Other"]) {
    const key = c.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(c.trim());
    }
  }
  return out;
}

export function cleanCategory(name: string): string | null {
  const c = name.trim().replace(/\s+/g, " ");
  return c.length >= 1 && c.length <= 40 ? c : null;
}
