/** A4 width in PDF points. The page height follows the receipt, so there's no empty space. */
const PAGE_WIDTH_PT = 595.28;

/** Make a one-page PDF of the receipt image. jsPDF is only downloaded when someone asks for a PDF. */
/** `payLink`: adds a clickable "Pay online" line under the receipt. */
export async function canvasToPdf(canvas: HTMLCanvasElement, payLink?: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const imageHeight = (PAGE_WIDTH_PT * canvas.height) / canvas.width;
  const linkBand = payLink ? 36 : 0;
  const pageHeight = imageHeight + linkBand;
  const pdf = new jsPDF({
    unit: "pt",
    format: [PAGE_WIDTH_PT, pageHeight],
    orientation: pageHeight >= PAGE_WIDTH_PT ? "portrait" : "landscape",
    compress: true,
  });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, PAGE_WIDTH_PT, imageHeight, undefined, "FAST");
  if (payLink) {
    pdf.setFontSize(12);
    pdf.setTextColor(62, 69, 128);
    pdf.textWithLink(`Pay online now: ${payLink}`, 24, imageHeight + 23, { url: payLink });
  }
  return pdf.output("blob");
}
