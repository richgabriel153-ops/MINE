import { mulDivKobo, percentOfKobo } from "./money";
import type { Discount, LineItem, PaymentStatus } from "./types";

export const VAT_PERCENT = 7.5;

export interface Totals {
  subtotalKobo: number;
  discountKobo: number;
  vatKobo: number;
  deliveryKobo: number;
  totalKobo: number;
  amountPaidKobo: number;
  balanceKobo: number;
}

export interface TotalsInput {
  items: Pick<LineItem, "quantity" | "unitPriceKobo">[];
  discount: Discount | null;
  deliveryKobo: number;
  vatEnabled: boolean;
  status: PaymentStatus;
  amountPaidKobo: number;
}

/** Quantity as an integer number of hundredths (1.5 → 150). Negative or invalid → 0. */
export function quantityHundredths(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.round(quantity * 100);
}

export function lineTotalKobo(item: Pick<LineItem, "quantity" | "unitPriceKobo">): number {
  return mulDivKobo(Math.max(0, item.unitPriceKobo), quantityHundredths(item.quantity), 100);
}

export function discountKobo(subtotalKobo: number, discount: Discount | null): number {
  if (!discount) return 0;
  const raw =
    discount.type === "amount"
      ? Math.max(0, discount.kobo)
      : percentOfKobo(subtotalKobo, Math.min(100, Math.max(0, discount.percent)));
  // A discount can never be more than the items cost.
  return Math.min(raw, subtotalKobo);
}

/**
 * Order of calculation:
 *   subtotal − discount = taxable
 *   + VAT (7.5% of taxable, when switched on)
 *   + delivery fee (not taxed)
 *   = total
 * Then amount paid / balance depend on the payment status.
 */
export function computeTotals(input: TotalsInput): Totals {
  const subtotal = input.items.reduce((sum, item) => sum + lineTotalKobo(item), 0);
  const discount = discountKobo(subtotal, input.discount);
  const taxable = subtotal - discount;
  const vat = input.vatEnabled ? percentOfKobo(taxable, VAT_PERCENT) : 0;
  const delivery = Math.max(0, input.deliveryKobo);
  const total = taxable + vat + delivery;

  let paid: number;
  switch (input.status) {
    case "paid":
      paid = total;
      break;
    case "unpaid":
      paid = 0;
      break;
    case "part":
      paid = Math.min(Math.max(0, input.amountPaidKobo), total);
      break;
  }

  return {
    subtotalKobo: subtotal,
    discountKobo: discount,
    vatKobo: vat,
    deliveryKobo: delivery,
    totalKobo: total,
    amountPaidKobo: paid,
    balanceKobo: total - paid,
  };
}
