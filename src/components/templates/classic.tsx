/* eslint-disable @next/next/no-img-element -- templates are rendered to images; data: URLs only */
import { brandTextColour, readableTextOn, withAlpha } from "@/lib/color";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import { hasBankDetails } from "@/lib/profile";
import { computeTotals, lineTotalKobo, VAT_PERCENT } from "@/lib/totals";
import {
  contactLines,
  formatQuantity,
  METHOD_LABEL,
  STATUS_COLOUR,
  STATUS_LABEL,
  TEMPLATE_WIDTH,
  type TemplateProps,
} from "./shared";

/** Classic: brand-coloured header band, clear table, totals on the right. */
export function ClassicTemplate({ doc, profile, showFooterBrand }: TemplateProps) {
  const brand = profile.brandColor;
  const onBrand = readableTextOn(brand);
  const brandText = brandTextColour(brand);
  const totals = computeTotals(doc);
  const isInvoice = doc.type === "invoice";
  const statusColour = STATUS_COLOUR[doc.status];

  return (
    <div
      style={{ width: TEMPLATE_WIDTH, fontFamily: "var(--font-inter), var(--font-naira), sans-serif" }}
      className="bg-white text-[13px] leading-snug text-[#111827]"
    >
      {/* Header */}
      <div style={{ backgroundColor: brand, color: onBrand }} className="flex items-center gap-4 px-7 py-6">
        {profile.logo && (
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
            <img src={profile.logo} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[20px] leading-tight font-bold break-words">{profile.name || "Your business"}</div>
          {contactLines(profile).map((line) => (
            <div key={line} className="mt-0.5 text-[11.5px] break-words opacity-90">
              {line}
            </div>
          ))}
        </div>
      </div>

      <div className="px-7 pt-6 pb-5">
        {/* Title + meta */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div style={{ color: brandText }} className="text-[24px] font-extrabold tracking-wide">
              {isInvoice ? "INVOICE" : "RECEIPT"}
            </div>
            <div className="mt-1 text-[12px] text-[#4b5563]">
              No. <span className="font-semibold text-[#111827]">{doc.number}</span>
            </div>
            {doc.sourceInvoiceNumber && (
              <div className="text-[12px] text-[#4b5563]">For invoice {doc.sourceInvoiceNumber}</div>
            )}
          </div>
          <div className="text-right text-[12px] text-[#4b5563]">
            <div>
              Date: <span className="font-semibold text-[#111827]">{formatDate(doc.issueDate)}</span>
            </div>
            {isInvoice && doc.dueDate && (
              <div>
                Due: <span className="font-semibold text-[#111827]">{formatDate(doc.dueDate)}</span>
              </div>
            )}
            <div
              style={{ color: statusColour, borderColor: statusColour }}
              className="mt-2 inline-block rounded-md border-2 px-2 py-0.5 text-[11px] font-bold tracking-wider"
            >
              {STATUS_LABEL[doc.status]}
            </div>
          </div>
        </div>

        {/* Customer */}
        {(doc.customer.name || doc.customer.phone) && (
          <div className="mt-5">
            <div className="text-[10.5px] font-semibold tracking-wider text-[#6b7280] uppercase">
              {isInvoice ? "Bill to" : "Customer"}
            </div>
            {doc.customer.name && <div className="text-[14px] font-semibold">{doc.customer.name}</div>}
            {doc.customer.phone && <div className="text-[12px] text-[#4b5563]">{formatNgPhone(doc.customer.phone)}</div>}
          </div>
        )}

        {/* Items */}
        <table className="mt-5 w-full border-collapse text-[12.5px]">
          <thead>
            <tr style={{ backgroundColor: withAlpha(brand, 0.1) }}>
              <th className="py-2 pl-2 text-left font-semibold">Item</th>
              <th className="w-12 py-2 text-center font-semibold">Qty</th>
              <th className="w-24 py-2 text-right font-semibold">Price</th>
              <th className="w-28 py-2 pr-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => (
              <tr key={item.id} className="border-b border-[#e5e7eb] align-top">
                <td className="py-2 pr-2 pl-2 break-words">{item.description}</td>
                <td className="py-2 text-center tabular-nums">{formatQuantity(item.quantity)}</td>
                <td className="py-2 text-right tabular-nums">{formatNaira(item.unitPriceKobo)}</td>
                <td className="py-2 pr-2 text-right font-medium tabular-nums">{formatNaira(lineTotalKobo(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-3 ml-auto w-64 text-[12.5px] tabular-nums">
          <Row label="Subtotal" value={formatNaira(totals.subtotalKobo)} />
          {totals.discountKobo > 0 && (
            <Row
              label={doc.discount?.type === "percent" ? `Discount (${doc.discount.percent}%)` : "Discount"}
              value={`-${formatNaira(totals.discountKobo)}`}
            />
          )}
          {totals.vatKobo > 0 && <Row label={`VAT (${VAT_PERCENT}%)`} value={formatNaira(totals.vatKobo)} />}
          {totals.deliveryKobo > 0 && <Row label="Delivery" value={formatNaira(totals.deliveryKobo)} />}
          <div
            style={{ backgroundColor: brand, color: onBrand }}
            className="mt-2 flex justify-between rounded-md px-3 py-2 text-[15px] font-bold"
          >
            <span>Total</span>
            <span>{formatNaira(totals.totalKobo)}</span>
          </div>
          {doc.status === "part" && (
            <>
              <Row label="Amount paid" value={formatNaira(totals.amountPaidKobo)} />
              <Row label="Balance" value={formatNaira(totals.balanceKobo)} bold colour={STATUS_COLOUR.part} />
            </>
          )}
          {doc.status === "unpaid" && isInvoice && (
            <Row label="Amount due" value={formatNaira(totals.balanceKobo)} bold colour={STATUS_COLOUR.unpaid} />
          )}
        </div>

        {doc.status !== "unpaid" && (
          <div className="mt-3 text-[12px] text-[#4b5563]">
            Payment method: <span className="font-semibold text-[#111827]">{METHOD_LABEL[doc.method]}</span>
          </div>
        )}

        {/* Bank details for invoices */}
        {isInvoice && doc.status !== "paid" && hasBankDetails(profile) && (
          <div
            style={{ borderColor: withAlpha(brand, 0.4), backgroundColor: withAlpha(brand, 0.06) }}
            className="mt-4 rounded-lg border px-4 py-3"
          >
            <div className="text-[10.5px] font-semibold tracking-wider text-[#6b7280] uppercase">Pay to</div>
            <div className="mt-1 text-[13px]">
              <span className="font-semibold">{profile.bankName}</span>
              {" · "}
              <span className="font-bold tracking-wide tabular-nums">{profile.accountNumber}</span>
            </div>
            {profile.accountName && <div className="text-[12.5px]">{profile.accountName}</div>}
          </div>
        )}

        {doc.notes && (
          <div className="mt-4 rounded-lg bg-[#f3f4f6] px-4 py-3 text-[12px] whitespace-pre-line text-[#374151]">
            {doc.notes}
          </div>
        )}

        <div style={{ color: brandText }} className="mt-5 text-center text-[13px] font-semibold">
          Thank you for your business!
        </div>
      </div>

      {showFooterBrand && (
        <div className="border-t border-[#e5e7eb] py-2 text-center text-[10px] text-[#9ca3af]">
          Made with ReceiptNaija
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, colour }: { label: string; value: string; bold?: boolean; colour?: string }) {
  return (
    <div style={colour ? { color: colour } : undefined} className={`flex justify-between py-1 ${bold ? "font-bold" : ""}`}>
      <span className={colour ? "" : "text-[#4b5563]"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
