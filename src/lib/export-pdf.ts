/** A4 width in PDF points. The page height follows the receipt, so there's no empty space. */
const PAGE_WIDTH_PT = 595.28;

/** Make a one-page PDF of the receipt image. jsPDF is only downloaded when someone asks for a PDF. */
export async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pageHeight = (PAGE_WIDTH_PT * canvas.height) / canvas.width;
  const pdf = new jsPDF({
    unit: "pt",
    format: [PAGE_WIDTH_PT, pageHeight],
    orientation: pageHeight >= PAGE_WIDTH_PT ? "portrait" : "landscape",
    compress: true,
  });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, PAGE_WIDTH_PT, pageHeight, undefined, "FAST");
  return pdf.output("blob");
}
