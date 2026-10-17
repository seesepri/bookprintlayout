import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { unzipSync } from "fflate";
import type { Sheet } from "../types";
import { planImposition } from "./imposition";
import { pdfPagesPerSignature, splitPdfBySignature, zipFiles } from "./pdfSplit";

function sheet(index: number, signature: number, front: [number | null, number | null], back: [number | null, number | null]): Sheet {
  return { index, signature, front: { left: front[0], right: front[1] }, back: { left: back[0], right: back[1] } };
}

/** One page per width, so a split can be checked by looking at page sizes. */
async function docWithPages(count: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([100 + i, 200]);
  return doc.save();
}

describe("pdfPagesPerSignature", () => {
  it("counts front and back for folded work", () => {
    const sheets = [sheet(0, 0, [8, 1], [2, 7]), sheet(1, 0, [6, 3], [4, 5]), sheet(2, 1, [4, 5], [6, 3])];
    expect(pdfPagesPerSignature(sheets, true)).toEqual([4, 2]);
  });

  it("skips the back side a perfect-bound book does not print", () => {
    const sheets = [
      sheet(0, 0, [2, 3], [4, 5]),
      sheet(1, 0, [6, 7], [null, null]),
      sheet(2, 1, [8, 9], [null, 10]),
    ];
    expect(pdfPagesPerSignature(sheets, false)).toEqual([3, 2]);
  });

  it("agrees with the real plan on total page count", () => {
    const plan = planImposition(16, "saddle-stitch", 8, "left");
    const counts = pdfPagesPerSignature(plan.sheets, true);
    expect(counts).toHaveLength(plan.signatures.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(plan.paddedTotal / 2);
  });
});

describe("splitPdfBySignature", () => {
  it("cuts contiguous runs, keeping each signature whole", async () => {
    const bytes = await docWithPages(6);
    const sheets = [
      sheet(0, 0, [8, 1], [2, 7]),
      sheet(1, 0, [6, 3], [4, 5]),
      sheet(2, 1, [4, 5], [6, 3]),
    ];
    const files = await splitPdfBySignature(bytes, sheets, true);
    expect(files).not.toBeNull();
    const [first, second] = files!;
    expect(await pagesOf(first)).toEqual([100, 101, 102, 103]);
    expect(await pagesOf(second)).toEqual([104, 105]);
  });

  it("keeps the duplex hint on every split file", async () => {
    const bytes = await docWithPages(4);
    const sheets = [sheet(0, 0, [4, 1], [2, 3]), sheet(1, 1, [2, 3], [4, 1])];
    const [file] = (await splitPdfBySignature(bytes, sheets, true))!;
    // Read it back through the parser: with object streams on, the dictionary
    // lives inside a stream, so searching the raw bytes would lie.
    const doc = await PDFDocument.load(file);
    expect(String(doc.catalog.lookup(PDFName.of("ViewerPreferences")))).toMatch(/DuplexFlipShortEdge/);
  });

  it("refuses to guess when the document is not the one the plan built", async () => {
    const bytes = await docWithPages(6);
    const tooMany = Array.from({ length: 5 }, (_, i) => sheet(i, i, [1, 2], [3, 4]));
    expect(await splitPdfBySignature(bytes, tooMany, true)).toBeNull();
    expect(await splitPdfBySignature(bytes, [], true)).toBeNull();
  });
});

describe("zipFiles", () => {
  it("round-trips every file by name", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([9]);
    const unzipped = unzipSync(zipFiles([
      { name: "signature-1.pdf", bytes: a },
      { name: "signature-2.pdf", bytes: b },
    ]));
    expect(Object.keys(unzipped).sort()).toEqual(["signature-1.pdf", "signature-2.pdf"]);
    expect([...unzipped["signature-1.pdf"]]).toEqual([1, 2, 3]);
    expect([...unzipped["signature-2.pdf"]]).toEqual([9]);
  });
});

async function pagesOf(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => page.getWidth());
}
