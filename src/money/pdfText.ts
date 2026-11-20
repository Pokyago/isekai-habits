import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PdfLine } from './itau';
import { groupLines, type PositionedText } from './pdfLines';

/*
 * Pulls the text out of a PDF, with positions, using pdf.js. This module is loaded
 * only when a PDF is actually imported, so the PDF library isn't part of the app's
 * normal start-up. The file is read on the device; nothing is uploaded.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

export async function readPdfLines(bytes: Uint8Array): Promise<PdfLine[]> {
  const task = getDocument({ data: bytes });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err instanceof Error && err.name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Save a copy without a password and try again.');
    }
    throw new Error('This PDF could not be opened.');
  }
  try {
    const texts: PositionedText[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        texts.push({ page: p, x: item.transform[4], y: item.transform[5], w: item.width, text: item.str });
      }
    }
    return groupLines(texts);
  } finally {
    void task.destroy();
  }
}
