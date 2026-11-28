"use client";

/**
 * Pull the text out of a PDF in the browser (pdf.js is already shipped for the
 * library viewer), so a teacher can turn notes or a past paper into questions
 * without the file ever being stored.
 */
export async function extractPdfText(file: File, maxChars = 60_000): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data } as never).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages && out.length < maxChars; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = (content.items as { str?: string; hasEOL?: boolean }[])
      .map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " "))
      .join("");
    out += text.replace(/[ \t]+/g, " ").trim() + "\n\n";
  }
  await doc.cleanup?.();
  return out.slice(0, maxChars).trim();
}
