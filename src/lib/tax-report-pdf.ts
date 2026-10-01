import { formatDate } from "./dates";
import { formatNaira } from "./money";
import type { TaxReport } from "./tax";

/** The PDF's built-in fonts have no ₦ sign, so amounts read "NGN 25,000". */
const ngn = (kobo: number) => formatNaira(kobo).replace("₦", "NGN ");

const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** A tax working paper (A4) the owner can keep or hand to their accountant. */
export async function taxReportPdf(report: TaxReport, businessName: string, preparedOn: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const left = 48;
  const right = 547;
  let y = 56;

  const ensureRoom = (h: number) => {
    if (y + h > 790) {
      pdf.addPage();
      y = 56;
    }
  };
  const heading = (text: string) => {
    ensureRoom(40);
    y += 14;
    pdf.setFont("helvetica", "bold").setFontSize(12).setTextColor(62, 69, 128);
    pdf.text(text, left, y);
    y += 8;
    pdf.setDrawColor(220).line(left, y, right, y);
    y += 16;
  };
  const row = (label: string, value: string, bold = false) => {
    ensureRoom(18);
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(10).setTextColor(30);
    pdf.text(label, left, y);
    pdf.text(value, right, y, { align: "right" });
    y += 17;
  };
  const para = (text: string) => {
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
    for (const line of pdf.splitTextToSize(text.replace(/₦/g, "NGN "), right - left) as string[]) {
      ensureRoom(14);
      pdf.text(line, left, y);
      y += 13;
    }
  };

  pdf.setFont("helvetica", "bold").setFontSize(18).setTextColor(30);
  pdf.text(`Tax estimate ${report.year}`, left, y);
  y += 20;
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(90);
  pdf.text(`${businessName || "My business"} · ${report.kind === "company" ? "Registered company" : "Sole trader / business name"}`, left, y);
  y += 14;
  pdf.text(`Prepared with InCeipt on ${formatDate(preparedOn)} · Nigeria Tax Act 2025`, left, y);
  y += 6;

  heading("Income");
  row("Money received", ngn(report.grossReceiptsKobo));
  row("Less VAT charged to customers", `(${ngn(report.outputVatKobo)})`);
  row("Turnover", ngn(report.turnoverKobo), true);
  row("Less business expenses", `(${ngn(report.expensesKobo)})`);
  if (report.excludedExpensesKobo > 0) row("Personal spending left out", ngn(report.excludedExpensesKobo));
  row(report.profitKobo < 0 ? "Loss" : "Profit", ngn(Math.abs(report.profitKobo)), true);

  heading(report.small ? "Small business: yes" : "Small business: no");
  for (const reason of report.smallReasons) para(`• ${reason}`);

  if (report.company) {
    heading("Company income tax");
    row("Company income tax (CIT)", ngn(report.company.citKobo));
    row("Development levy", ngn(report.company.levyKobo));
  }
  if (report.personal) {
    heading("Personal income tax");
    row("Profit", ngn(Math.max(0, report.profitKobo)));
    row("Less rent relief", `(${ngn(report.personal.rentReliefKobo)})`);
    row("Less pension contributions", `(${ngn(report.personal.pensionKobo)})`);
    row("Chargeable income", ngn(report.personal.chargeableKobo), true);
    for (const band of report.personal.bands) row(`${band.label.replace(/₦/g, "NGN ")} at ${band.percent}%`, ngn(band.taxKobo));
  }
  y += 4;
  row("Estimated tax to pay", ngn(report.totalTaxKobo), true);
  row("Effective rate on profit", `${report.effectiveRatePercent}%`);

  heading("VAT (7.5%)");
  para(
    report.vat.mustCharge
      ? "Above the small business limit: register for VAT, charge 7.5% and file every month by the 21st."
      : "Small business: you don't have to charge VAT or file VAT returns.",
  );
  y += 4;
  for (const m of report.vat.months) row(`${monthName(m.month)} (due ${formatDate(m.dueDate)})`, ngn(m.vatKobo));
  row("VAT charged this year", ngn(report.outputVatKobo), true);

  heading("Deadlines");
  for (const d of report.deadlines) row(d.label, /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? formatDate(d.date) : d.date);

  heading("Notes");
  for (const note of report.notes) para(`• ${note}`);
  y += 8;
  para(
    "This is an estimate from the records in InCeipt, not professional tax advice. Capital allowances, withholding tax credits and other adjustments are not included. Please confirm with a chartered tax practitioner before you file.",
  );
  return pdf.output("blob");
}
