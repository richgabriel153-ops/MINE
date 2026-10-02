import { formatNaira } from "@/lib/money";
import { VAT_PERCENT, type Totals } from "@/lib/totals";
import type { PaymentStatus } from "@/lib/types";

export function TotalsPanel({ totals, status }: { totals: Totals; status: PaymentStatus }) {
  const rows: [string, string][] = [["Subtotal", formatNaira(totals.subtotalKobo)]];
  if (totals.discountKobo) rows.push(["Discount", `-${formatNaira(totals.discountKobo)}`]);
  if (totals.vatKobo) rows.push([`VAT (${VAT_PERCENT}%)`, formatNaira(totals.vatKobo)]);
  if (totals.deliveryKobo) rows.push(["Delivery", formatNaira(totals.deliveryKobo)]);

  return (
    <dl className="flex flex-col gap-1.5 rounded-xl bg-secondary/60 p-4 text-sm tabular-nums">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-foreground/10 pt-2 text-lg font-bold">
        <dt>Total</dt>
        <dd>{formatNaira(totals.totalKobo)}</dd>
      </div>
      {status === "part" && (
        <>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid</dt>
            <dd>{formatNaira(totals.amountPaidKobo)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-warning">
            <dt>Balance</dt>
            <dd>{formatNaira(totals.balanceKobo)}</dd>
          </div>
        </>
      )}
    </dl>
  );
}
