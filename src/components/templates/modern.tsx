/* eslint-disable @next/next/no-img-element -- templates are rendered to images; data: URLs only */
import { brandTextColour, readableTextOn, withAlpha } from "@/lib/color";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import { computeTotals, lineTotalKobo } from "@/lib/totals";
import {
  breakdownRows,
  contactLines,
  formatQuantity,
  METHOD_LABEL,
  showsBankDetails,
  STATUS_COLOUR,
  STATUS_LABEL,
  TEMPLATE_FONT,
  TEMPLATE_WIDTH,
  type TemplateProps,
} from "./shared";
import { PayNowBlock } from "./pay-now-block";

/** Modern: white page, brand stripe on the left, big amount up top, items as a clean list. */
export function ModernTemplate({ doc, profile, showFooterBrand, payNow }: TemplateProps) {
  const brand = profile.brandColor;
  const brandText = brandTextColour(brand);
  const onBrand = readableTextOn(brand);
  const totals = computeTotals(doc);
  const isInvoice = doc.type === "invoice";
  const headline =
    doc.status === "paid"
      ? { label: isInvoice ? "Total" : "Amount paid", kobo: totals.totalKobo }
      : doc.status === "part"
        ? { label: "Balance to pay", kobo: totals.balanceKobo }
        : { label: "Amount due", kobo: totals.totalKobo };

  return (
    <div style={{ width: TEMPLATE_WIDTH, fontFamily: TEMPLATE_FONT }} className="relative bg-white text-[13px] leading-snug text-[#111827]">
      <div style={{ backgroundColor: brand }} className="absolute inset-y-0 left-0 w-2" />
      <div className="px-8 pt-7 pb-5">
        {/* Business */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {profile.logo && (
              <img src={profile.logo} alt="" className="mb-3 max-h-14 max-w-[160px] object-contain" />
            )}
            <div style={{ color: brandText }} className="text-[19px] leading-tight font-bold break-words">
              {profile.name || "Your business"}
            </div>
            {contactLines(profile).map((line) => (
              <div key={line} className="mt-0.5 text-[11.5px] break-words text-[#6b7280]">
                {line}
              </div>
            ))}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-semibold tracking-[0.2em] text-[#9ca3af]">{isInvoice ? "INVOICE" : "RECEIPT"}</div>
            <div className="text-[15px] font-bold">{doc.number}</div>
            <div className="mt-1 text-[11.5px] text-[#6b7280]">{formatDate(doc.issueDate)}</div>
          </div>
        </div>

        {/* Headline amount */}
        <div
          style={{ backgroundColor: withAlpha(brand, 0.08) }}
          className="mt-6 flex items-end justify-between gap-3 rounded-2xl px-5 py-4"
        >
          <div>
            <div className="text-[11.5px] text-[#4b5563]">{headline.label}</div>
            <div style={{ color: brandText }} className="text-[30px] leading-tight font-extrabold tabular-nums">
              {formatNaira(headline.kobo)}
            </div>
            {isInvoice && doc.dueDate && doc.status !== "paid" && (
              <div className="mt-0.5 text-[11.5px] text-[#4b5563]">Due by {formatDate(doc.dueDate)}</div>
            )}
          </div>
          <div
            style={{ backgroundColor: STATUS_COLOUR[doc.status] }}
            className="mb-1 rounded-full px-3 py-1 text-[10.5px] font-bold tracking-wider text-white"
          >
            {STATUS_LABEL[doc.status]}
          </div>
        </div>

        {/* Customer */}
        {(doc.customer.name || doc.customer.phone) && (
          <div className="mt-5 flex gap-2 text-[12.5px]">
            <span className="text-[#6b7280]">{isInvoice ? "Billed to" : "Customer"}:</span>
            <span className="font-semibold">
              {[doc.customer.name, doc.customer.phone && formatNgPhone(doc.customer.phone)].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        {/* Items */}
        <div className="mt-4 border-t border-[#e5e7eb]">
          {doc.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 border-b border-[#f0f1f3] py-2.5">
              <div className="min-w-0">
                <div className="font-medium break-words">{item.description}</div>
                <div className="text-[11.5px] text-[#6b7280] tabular-nums">
                  {formatQuantity(item.quantity)} × {formatNaira(item.unitPriceKobo)}
                </div>
              </div>
              <div className="shrink-0 font-semibold tabular-nums">{formatNaira(lineTotalKobo(item))}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="mt-3 ml-auto w-60 text-[12.5px] tabular-nums">
          {breakdownRows(doc, totals).map((r) => (
            <div key={r.label} className="flex justify-between py-0.5">
              <span className="text-[#6b7280]">{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-[#111827] pt-1.5 text-[14px] font-bold">
            <span>Total</span>
            <span>{formatNaira(totals.totalKobo)}</span>
          </div>
          {doc.status === "part" && (
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-[#6b7280]">Paid</span>
                <span>{formatNaira(totals.amountPaidKobo)}</span>
              </div>
              <div style={{ color: STATUS_COLOUR.part }} className="flex justify-between py-0.5 font-bold">
                <span>Balance</span>
                <span>{formatNaira(totals.balanceKobo)}</span>
              </div>
            </>
          )}
        </div>

        {doc.status !== "unpaid" && (
          <div className="mt-2 text-[11.5px] text-[#6b7280]">
            Paid by <span className="font-semibold text-[#111827]">{METHOD_LABEL[doc.method]}</span>
            {doc.sourceInvoiceNumber && <> · for invoice {doc.sourceInvoiceNumber}</>}
          </div>
        )}

        {payNow && <PayNowBlock url={payNow.url} qr={payNow.qr} colour={brandText} />}
        {showsBankDetails(doc, profile) && (
          <div style={{ backgroundColor: brand, color: onBrand }} className="mt-5 rounded-xl px-5 py-3.5">
            <div className="text-[10.5px] font-semibold tracking-wider uppercase opacity-80">Pay by transfer</div>
            <div className="mt-0.5 text-[18px] font-bold tracking-wide tabular-nums">{profile.accountNumber}</div>
            <div className="text-[12.5px]">
              {profile.bankName}
              {profile.accountName && ` · ${profile.accountName}`}
            </div>
          </div>
        )}

        {doc.notes && <div className="mt-4 text-[12px] whitespace-pre-line text-[#4b5563]">{doc.notes}</div>}
      </div>

      {showFooterBrand && (
        <div className="pb-3 text-center text-[10px] text-[#9ca3af]">Made with InCeipt</div>
      )}
    </div>
  );
}
