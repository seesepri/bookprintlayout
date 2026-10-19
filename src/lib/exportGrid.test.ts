import { PDFContext, PDFDict, PDFDocument, PDFName, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildImpositionPdf } from "./pdfEngine";
import { planImposition } from "./imposition";
import type { MarksSettings, PageInfo } from "../types";

const BOOK = { width: 148, height: 210 }; // A5
const SHEET = { width: 324, height: 484 }; // custom portrait, mm
const NO_MARKS: MarksSettings = {
  showCropMarks: false, showBleedArea: false, showSafeArea: false,
  showFoldMarks: false, showCenterLine: false, showRegistrationMarks: false,
};
const ALL_MARKS: MarksSettings = {
  showCropMarks: true, showBleedArea: true, showSafeArea: true,
  showFoldMarks: true, showCenterLine: true, showRegistrationMarks: true,
};

const pagesFor = (n: number): PageInfo[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, originalIndex: i, rotation: 0 as const, isBlank: false, widthPt: 419.5, heightPt: 595,
  }));

async function makeSource(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) {
    const page = doc.addPage([419.5, 595]);
    page.drawRectangle({ x: 40, y: 40, width: 300, height: 400, color: rgb(0.9, 0.9, 0.9) });
  }
  return doc.save();
}

/**
 * How many pages of the source a side actually draws.
 *
 * pdf-lib registers one Form XObject per embedded source page a page uses, and
 * slots that fall on padding are virtual (never embedded), so this count is the
 * number of real placements on that side — read straight off the printed file.
 */
function formXObjectsPerSide(doc: PDFDocument): number[] {
  const ctx = (doc as unknown as { context: PDFContext }).context;
  return doc.getPages().map((page) => {
    const res = ctx.lookup(page.node.get(PDFName.of("Resources")) as never) as PDFDict | undefined;
    const xobjects = res && (ctx.lookup(res.get(PDFName.of("XObject")) as never) as PDFDict | undefined);
    return xobjects ? Array.from(xobjects.entries()).length : 0;
  });
}

const build = async (sourceBytes: Uint8Array, extra: Record<string, unknown> = {}) => {
  const bytes = await buildImpositionPdf({
    sourceBytes,
    pages: pagesFor(28),
    binding: "booklet",
    signatureSize: 16,
    bookSize: BOOK,
    paperSize: SHEET,
    bleedMm: 0,
    safeAreaMm: 0,
    gutterMm: 0,
    marks: NO_MARKS,
    ...extra,
  } as Parameters<typeof buildImpositionPdf>[0]);
  return PDFDocument.load(bytes);
};

describe("export honours the denser grid", () => {
  it("halves the physical sheets of a folded book", async () => {
    const source = await makeSource(28);
    const quad = await build(source, { grid: { cols: 2, rows: 2 } });
    const pair = await build(source);

    // 28 pages padded to 32: 4 sheets x 2 sides against 7 x 2. The preview
    // promises the same number because both read the same plan.
    expect(quad.getPageCount()).toBe(8);
    expect(pair.getPageCount()).toBe(14);
    expect(planImposition(28, "booklet", 16, "left", { slotsPerSide: 4 }).sheets).toHaveLength(4);
  });

  it("keeps the paper size of every side and draws each page exactly once", async () => {
    const quad = await build(await makeSource(28), { grid: { cols: 2, rows: 2 } });
    const mmToPt = (mm: number) => (mm * 72) / 25.4;
    for (const page of quad.getPages()) {
      const box = page.getMediaBox();
      expect(box.width).toBeCloseTo(mmToPt(SHEET.width), 1);
      expect(box.height).toBeCloseTo(mmToPt(SHEET.height), 1);
    }
    const perSide = formXObjectsPerSide(quad);
    expect(perSide.reduce((a, b) => a + b, 0)).toBe(28);
    // The outer sheet is the padded one: its two sides only reach 2 real pages
    // each, which is what "virtual blank" means for a guillotine-ready sheet.
    expect(perSide.slice(0, 2)).toEqual([2, 2]);
    expect(perSide.slice(2).every((n) => n === 4)).toBe(true);
  });

  it("survives the full mark set on a 2x2 folded sheet", async () => {
    const quad = await build(await makeSource(28), { grid: { cols: 2, rows: 2 }, marks: ALL_MARKS, bleedMm: 3 });
    expect(quad.getPageCount()).toBe(8);
    expect(formXObjectsPerSide(quad).reduce((a, b) => a + b, 0)).toBe(28);
  });
});
