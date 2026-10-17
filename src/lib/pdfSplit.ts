import { PDFDocument } from "pdf-lib";
import { zipSync, type Zippable } from "fflate";
import type { Sheet } from "../types";
import { applyPrintIntent, sheetSideIsEmpty } from "./pdfEngine";

/**
 * Splitting an imposed PDF into one file per signature.
 *
 * The engine lays out sheets in signature order, so a signature is always a
 * contiguous run of output pages. The run length is derived from the very plan
 * that produced the file — including the rule that a perfect-bound book skips
 * an empty back side — rather than from arithmetic the caller has to remember.
 */

/** PDF pages written per signature, in signature order. */
export function pdfPagesPerSignature(sheets: Sheet[], isFolded: boolean): number[] {
  const counts = new Map<number, number>();
  for (const sheet of sheets) {
    const pagesOnSheet = isFolded || !sheetSideIsEmpty(sheet.back) ? 2 : 1;
    counts.set(sheet.signature, (counts.get(sheet.signature) ?? 0) + pagesOnSheet);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, count]) => count);
}

export interface SignatureFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Returns null when the page arithmetic does not line up with the document —
 * that means the bytes were not produced by this plan, and guessing a split
 * point would silently hand a printer the wrong pages.
 */
export async function splitPdfBySignature(
  bytes: Uint8Array,
  sheets: Sheet[],
  isFolded: boolean
): Promise<Uint8Array[] | null> {
  const counts = pdfPagesPerSignature(sheets, isFolded);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!counts.length || total !== doc.getPageCount()) return null;

  const files: Uint8Array[] = [];
  let cursor = 0;
  for (const count of counts) {
    const target = await PDFDocument.create();
    target.setProducer("BookPrint Layout");
    target.setCreator("BookPrint Layout");
    const indices = Array.from({ length: count }, (_, i) => cursor + i);
    const copied = await target.copyPages(doc, indices);
    copied.forEach((page) => target.addPage(page));
    // Each form is printed on its own, so it needs the duplex hint too.
    applyPrintIntent(target, isFolded);
    files.push(await target.save({ useObjectStreams: true }));
    cursor += count;
  }
  return files;
}

export function zipFiles(entries: SignatureFile[]): Uint8Array {
  const files: Zippable = {};
  for (const entry of entries) files[entry.name] = entry.bytes;
  return zipSync(files, { level: 6 });
}
