import { PDFDocument, PDFName, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildCoverPdf, buildImpositionPdf } from "./pdfEngine";
import { MarksSettings, PageInfo } from "../types";

const BOOK = { width: 148, height: 210 }; // A5
const PAPER = { width: 420, height: 297 }; // A3 landscape
const NO_MARKS: MarksSettings = {
  showCropMarks: false,
  showBleedArea: false,
  showSafeArea: false,
  showFoldMarks: false,
  showCenterLine: false,
  showRegistrationMarks: false,
};
const ALL_MARKS: MarksSettings = {
  showCropMarks: true,
  showBleedArea: true,
  showSafeArea: true,
  showFoldMarks: true,
  showCenterLine: true,
  showRegistrationMarks: true,
};

async function makeSource(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([419.5, 595]);
    page.drawRectangle({ x: 40, y: 40, width: 300, height: 400, color: rgb(0.9, 0.9, 0.9) });
  }
  return doc.save();
}

function pagesFor(count: number, offset = 0): PageInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i + offset}`,
    originalIndex: i + offset,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 419.5,
    heightPt: 595,
  }));
}

async function build(overrides: Partial<Parameters<typeof buildImpositionPdf>[0]> = {}) {
  const pageCount = overrides.pages?.length ?? 16;
  const bytes = await buildImpositionPdf({
    sourceBytes: await makeSource(16),
    pages: pagesFor(pageCount),
    binding: "booklet",
    signatureSize: 16,
    bookSize: BOOK,
    paperSize: PAPER,
    bleedMm: 3,
    safeAreaMm: 5,
    gutterMm: 4,
    marks: ALL_MARKS,
    ...overrides,
  } as Parameters<typeof buildImpositionPdf>[0]);
  return PDFDocument.load(bytes);
}

describe("buildImpositionPdf", () => {
  it("emits exactly one PDF page per printed side", async () => {
    // A sheet carries 4 book pages (2 per side), so 16 pages -> 4 sheets -> 8 sides.
    expect((await build({ pages: pagesFor(16) })).getPageCount()).toBe(8);
    // 10 pages pad to 12 -> 3 sheets -> 6 sides.
    expect((await build({ pages: pagesFor(10) })).getPageCount()).toBe(6);
  });

  it("prints perfect binding duplex instead of wasting the back of every sheet", async () => {
    // 4 pages: one sheet, both sides.
    expect((await build({ pages: pagesFor(4), binding: "perfect-binding" })).getPageCount()).toBe(2);
    // 2 pages: the back side carries nothing, so it is not emitted at all.
    expect((await build({ pages: pagesFor(2), binding: "perfect-binding" })).getPageCount()).toBe(1);
  });

  it("sizes every sheet to the selected paper", async () => {
    const doc = await build({ pages: pagesFor(8) });
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo((420 * 72) / 25.4, 1);
    expect(height).toBeCloseTo((297 * 72) / 25.4, 1);
  });

  it("writes the duplex + no-scaling print intent into the file", async () => {
    const doc = await build({ pages: pagesFor(8) });
    const prefs = String(doc.catalog.lookup(PDFName.of("ViewerPreferences")));
    expect(prefs).toMatch(/DuplexFlipShortEdge/);
    expect(prefs).toMatch(/PrintScaling/);
    expect(prefs).toMatch(/None/);
  });

  it("adds one labelled divider page per signature in per-signature mode", async () => {
    // 16 pages split into two 8-page signatures -> two extra pages, nothing else changes.
    const args = { pages: pagesFor(16), binding: "signature" as const, signatureSize: 8 };
    const plain = await build(args);
    const perSig = await build({ ...args, mode: "per-signature" });
    expect(plain.getPageCount()).toBe(8);
    expect(perSig.getPageCount()).toBe(10);
  });

  it("embeds only the source pages the plan still uses", async () => {
    const source = await makeSource(16);
    const formCount = async (pages: PageInfo[]) => {
      const bytes = await buildImpositionPdf({
        sourceBytes: source,
        pages,
        binding: "booklet",
        signatureSize: 16,
        bookSize: BOOK,
        paperSize: PAPER,
        bleedMm: 3,
        safeAreaMm: 5,
        gutterMm: 4,
        marks: NO_MARKS,
        compress: false,
      });
      // Uncompressed output keeps one /Form XObject per embedded source page.
      const text = Buffer.from(bytes).toString("latin1");
      return (text.match(/\/Subtype\s*\/Form/g) ?? []).length;
    };

    expect(await formCount(pagesFor(4))).toBe(4);
    expect(await formCount(pagesFor(16))).toBe(16);
    // Deleting the second half of a document must not keep its content around.
    expect(await formCount(pagesFor(4, 0))).toBeLessThan(await formCount(pagesFor(16)));
  });

  it("honours the compress switch", async () => {
    const args = {
      pages: pagesFor(16),
      marks: NO_MARKS,
      signatureSize: 16,
      bookSize: BOOK,
      paperSize: PAPER,
      bleedMm: 3,
      safeAreaMm: 5,
      gutterMm: 4,
      binding: "booklet" as const,
    };
    const source = await makeSource(16);
    const packed = await buildImpositionPdf({ ...args, sourceBytes: source, compress: true });
    const loose = await buildImpositionPdf({ ...args, sourceBytes: source, compress: false });
    expect(packed.byteLength).toBeLessThan(loose.byteLength);
  });
});

describe("buildCoverPdf", () => {
  it("lays out back | spine | front with bleed on both sides", async () => {
    const { bytes, notes } = await buildCoverPdf({ bookSize: BOOK, spineWidthMm: 12, bleedMm: 3 });
    expect(notes).toEqual([]);
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPage(0).getSize();
    const mm = (v: number) => (v * 72) / 25.4;
    expect(width).toBeCloseTo(mm(148 * 2 + 12 + 6), 1);
    expect(height).toBeCloseTo(mm(210 + 6), 1);
  });

  it("still builds a usable sheet when there is no bleed room for marks", async () => {
    // With zero bleed the trim box is the page box, so the marks would fall off
    // the page at their nominal size; they shrink to fit instead.
    const doc = await PDFDocument.load(
      (await buildCoverPdf({ bookSize: BOOK, spineWidthMm: 12, bleedMm: 0, includeCropMarks: true })).bytes
    );
    const { width, height } = doc.getPage(0).getSize();
    const mm = (v: number) => (v * 72) / 25.4;
    expect(width).toBeCloseTo(mm(148 * 2 + 12), 1);
    expect(height).toBeCloseTo(mm(210), 1);
  });
});
