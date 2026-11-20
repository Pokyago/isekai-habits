import type { PdfLine } from './itau';

/** A piece of text on a PDF page. `y` grows upwards, as in PDF coordinates. */
export interface PositionedText {
  page: number;
  x: number;
  y: number;
  w: number;
  text: string;
}

/** How far apart (in PDF points) two baselines can be and still count as the same line. */
const SAME_LINE = 3;

/**
 * Turns loose pieces of text into visual lines, in reading order: page by page,
 * top to bottom, each line left to right. Cells of one table row sit on slightly
 * different baselines, hence the tolerance.
 */
export function groupLines(texts: PositionedText[]): PdfLine[] {
  const sorted = [...texts].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: { page: number; y: number; items: PositionedText[] }[] = [];
  for (const t of sorted) {
    const line = lines[lines.length - 1];
    if (line && line.page === t.page && Math.abs(line.y - t.y) <= SAME_LINE) line.items.push(t);
    else lines.push({ page: t.page, y: t.y, items: [t] });
  }
  return lines.map((l) => ({
    items: l.items.sort((a, b) => a.x - b.x).map(({ x, w, text }) => ({ x, w, text })),
  }));
}
