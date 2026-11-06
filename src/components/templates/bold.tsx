/* eslint-disable @next/next/no-img-element -- templates are rendered to images; data: URLs only */
import { readableTextOn, withAlpha } from "@/lib/color";
import { formatDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { formatNgPhone } from "@/lib/phone";
import { computeTotals, lineTotalKobo } from "@/lib/totals";
import {
  breakdownRows,
  contactLines,
  docTitle,
  dueLabel,
  formatQuantity,
  METHOD_LABEL,
  showsBankDetails,
  showsStamp,
  STATUS_LABEL,
  TEMPLATE_FONT,
  TEMPLATE_WIDTH,
  type TemplateProps,
} from "./shared";
import { PayNowBlock } from "./pay-now-block";

/** Bold (Pro): full brand-colour page top, big type, striped item rows. */
export function BoldTemplate({ doc, profile, showFooterBrand, payNow }: TemplateProps) {
  const brand = profile.brandColor;
  const onBrand = readableTextOn(brand);
  const totals = computeTotals(doc);

  return (
    <div style={{ width: TEMPLATE_WIDTH, fontFamily: TEMPLATE_FONT }} className="bg-white text-[13px] leading-snug text-[#111827]">
      <div style={{ backgroundColor: brand, color: onBrand }} className="px-8 pt-8 pb-16">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[22px] leading-tight font-extrabold break-words">{profile.name || "Your business"}</div>
            {contactLines(profile).map((line) => (
              <div key={line} className="mt-0.5 text-[11.5px] break-words opacity-85">
                {line}
              </div>
            ))}
          </div>
          {profile.logo && (
            <div className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5">
              <img src={profile.logo} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
        <div className="mt-7 text-[40px] leading-none font-black tracking-tight">{docTitle(doc)}</div>
        <div className="mt-2 flex gap-5 text-[12px] opacity-90">
          <span>{doc.number}</span>
          <span>{formatDate(doc.issueDate)}</span>
          {doc.type !== "receipt" && doc.dueDate && <span>{dueLabel(doc)} {formatDate(doc.dueDate)}</span>}
        </div>
      </div>

      <div className="-mt-10 px-6">
        <div className="rounded-2xl bg-white px-5 py-4 shadow-[0_6px_24px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-[#6b7280] uppercase">{doc.type === "receipt" ? "Customer" : doc.type === "quote" ? "Prepared for" : "Billed to"}</div>
              <div className="text-[15px] font-bold">{doc.customer.name || "—"}</div>
              {doc.customer.phone && <div className="text-[12px] text-[#4b5563]">{formatNgPhone(doc.customer.phone)}</div>}
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold tracking-wider text-[#6b7280] uppercase">Total</div>
              <div className="text-[24px] font-black tabular-nums">{formatNaira(totals.totalKobo)}</div>
              {showsStamp(doc) && (
                <div className="text-[11px] font-bold tracking-wider" style={{ color: brand }}>
                  {STATUS_LABEL[doc.status]}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pt-6 pb-5">
        {doc.items.map((item, i) => (
          <div
            key={item.id}
            style={i % 2 === 0 ? { backgroundColor: withAlpha(brand, 0.07) } : undefined}
            className="-mx-3 flex items-start justify-between gap-4 rounded-lg px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="font-semibold break-words">{item.description}</div>
              <div className="text-[11.5px] text-[#6b7280] tabular-nums">
                {formatQuantity(item.quantity)} × {formatNaira(item.unitPriceKobo)}
              </div>
            </div>
            <div className="shrink-0 font-bold tabular-nums">{formatNaira(lineTotalKobo(item))}</div>
          </div>
        ))}

        <div className="mt-4 ml-auto w-64 text-[12.5px] tabular-nums">
          {breakdownRows(doc, totals).map((r) => (
            <div key={r.label} className="flex justify-between py-0.5">
              <span className="text-[#6b7280]">{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          {doc.status === "part" && (
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-[#6b7280]">Paid</span>
                <span>{formatNaira(totals.amountPaidKobo)}</span>
              </div>
              <div style={{ backgroundColor: brand, color: onBrand }} className="mt-1 flex justify-between rounded-lg px-3 py-2 text-[14px] font-bold">
                <span>Balance</span>
                <span>{formatNaira(totals.balanceKobo)}</span>
              </div>
            </>
          )}
        </div>

        {doc.status !== "unpaid" && (
          <div className="mt-3 text-[11.5px] text-[#6b7280]">
            Paid by <span className="font-semibold text-[#111827]">{METHOD_LABEL[doc.method]}</span>
            {doc.sourceInvoiceNumber && <> · for invoice {doc.sourceInvoiceNumber}</>}
          </div>
        )}

        {payNow && <PayNowBlock url={payNow.url} qr={payNow.qr} colour={brand} />}
        {showsBankDetails(doc, profile) && (
          <div style={{ borderColor: brand }} className="mt-5 rounded-xl border-2 px-5 py-3.5">
            <div className="text-[10.5px] font-semibold tracking-wider text-[#6b7280] uppercase">Pay to</div>
            <div className="text-[19px] font-black tracking-wide tabular-nums">{profile.accountNumber}</div>
            <div className="text-[12.5px]">
              {profile.bankName}
              {profile.accountName && ` · ${profile.accountName}`}
            </div>
          </div>
        )}

        {doc.notes && <div className="mt-4 text-[12px] whitespace-pre-line text-[#4b5563]">{doc.notes}</div>}
      </div>
      {showFooterBrand && <div className="pb-3 text-center text-[10px] text-[#9ca3af]">Made with InCeipt</div>}
    </div>
  );
}
