/**
 * Render the first N pages of a PDF to PNG image data URLs.
 * Uses pdf-parse's built-in getScreenshot (backed by pdfjs-dist + @napi-rs/canvas),
 * so no extra system dependencies are required. Used as an OCR/vision fallback when
 * a PDF has no embedded text layer (scanned or photographed documents).
 */
export async function renderPdfToImages(
  buffer: Buffer,
  maxPages = 4,
  scale = 2,
): Promise<string[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const shot = await parser.getScreenshot({ first: maxPages, scale });
    return shot.pages
      .map((p) => p.dataUrl)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  } finally {
    await parser.destroy().catch(() => {});
  }
}
