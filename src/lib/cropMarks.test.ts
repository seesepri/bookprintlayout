import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib";
import type { MarksSettings, PageInfo } from "../types";
import { buildImpositionPdf, drawCropMarks, drawRegistrationMarks } from "./pdfEngine";
import { fitMarkRun, validateImposition } from "./geometry";
import { planImposition } from "./imposition";

const MM = 72 / 25.4;
/** The engine's own mark geometry, in points: 2 mm gap + 5 mm line. */
const GAP_PT = 2 * MM;
const LEN_PT = 5 * MM;

const MARKS: MarksSettings = {
  showCropMarks: true,
  showBleedArea: true,
  showSafeArea: true,
  showFoldMarks: true,
  showCenterLine: true,
  showRegistrationMarks: true,
};

/** 148 x 210 book with 3 mm bleed: A3 leaves 0,5 mm at the sides, 0 mm top/bottom. */
const BOOK = { width: 148, height: 210 };

describe("fitMarkRun", () => {
  it("keeps the full gap and length when the sheet has room", () => {
    const run = fitMarkRun(40, GAP_PT, LEN_PT);
    expect(run).not.toBeNull();
    expect(run!.spanPt).toBeCloseTo(GAP_PT + LEN_PT, 6);
    expect(run!.gapPt).toBeCloseTo(GAP_PT, 6);
  });

  it("shortens the run instead of letting it fall off the sheet", () => {
    const room = 8;
    const run = fitMarkRun(room, GAP_PT, LEN_PT)!;
    expect(run.spanPt).toBeCloseTo(room - 1, 6);
    expect(run.gapPt).toBeLessThanOrEqual(run.spanPt * 0.4 + 1e-9);
  });

  it("drops the mark rather than drawing a stub", () => {
    expect(fitMarkRun(2, GAP_PT, LEN_PT)).toBeNull();
    expect(fitMarkRun(0, GAP_PT, LEN_PT)).toBeNull();
    expect(fitMarkRun(-19, GAP_PT, LEN_PT)).toBeNull();
  });

  it("survives nonsense input without producing NaN geometry", () => {
    expect(fitMarkRun(Number.NaN, GAP_PT, LEN_PT)).toBeNull();
    expect(fitMarkRun(10, Number.POSITIVE_INFINITY, LEN_PT)).toBeNull();
  });
});

describe("drawCropMarks", () => {
  it("draws nothing on a page with no margin", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 100]);
    drawCropMarks(page, [{ x: 1.4 / MM, y: 1.4 / MM, dx: -1, dy: -1 }], GAP_PT, LEN_PT);
    const saved = await PDFDocument.load(await doc.save());
    expect(opsOnPage(saved, 0)).toEqual([]);
  });

  it("keeps every mark inside the page box", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 100]);
    const markAt = (x: number, y: number, dx: -1 | 1, dy: -1 | 1) => ({ x: x / MM, y: y / MM, dx, dy });
    drawCropMarks(
      page,
      [markAt(30, 30, -1, -1), markAt(70, 70, 1, 1), markAt(6, 50, -1, 1)],
      GAP_PT,
      LEN_PT
    );
    const ops = opsOnPage(await PDFDocument.load(await doc.save()), 0);
    expect(ops.length).toBeGreaterThan(0);
    for (const [x, y] of ops) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
    // The mark with only 6 pt of room is drawn short, not clipped away.
    expect(ops.some(([x]) => Math.abs(x - (30 - GAP_PT - LEN_PT)) < 0.01)).toBe(true);
  });

  it("keeps registration marks inside the sheet even at a 3 pt inset", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 100]);
    drawRegistrationMarks(page, 100, 100, 3);
    const ops = opsOnPage(await PDFDocument.load(await doc.save()), 0);
    expect(ops.length).toBeGreaterThan(0);
    for (const [x, y] of ops) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });
});

describe("the exported sheet", () => {
  it("draws nothing outside the media box when the layout is valid", async () => {
    // 320 x 230 clears the geometry check, so every mark, guide and rect here
    // has to be on the sheet — that is the promise the print shop relies on.
    const bytes = await buildImpositionPdf({
      sourceBytes: await source(8),
      pages: pagesOf(8),
      binding: "booklet",
      signatureSize: 8,
      bookSize: BOOK,
      paperSize: { width: 320, height: 230 },
      bleedMm: 3,
      safeAreaMm: 12,
      gutterMm: 0,
      marks: MARKS,
      creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
    });
    const doc = await PDFDocument.load(bytes);
    const offenders: string[] = [];
    doc.getPages().forEach((page, index) => {
      const w = page.getWidth();
      const h = page.getHeight();
      for (const [x, y] of opsOnPage(doc, index)) {
        if (x < -1e-3 || y < -1e-3 || x > w + 1e-3 || y > h + 1e-3) {
          offenders.push(`page ${index}: ${x.toFixed(2)},${y.toFixed(2)} vs ${w.toFixed(1)}x${h.toFixed(1)}`);
        }
      }
    });
    expect(offenders).toEqual([]);
  });

  it("still blocks the undersized paper with an explicit error", async () => {
    const plan = planImposition(8, "booklet", 8, "left");
    const result = validateImposition({
      pages: pagesOf(8),
      sheets: plan.sheets,
      sheetCount: plan.sheets.length,
      signatureSheetCounts: plan.signatureSheetCounts,
      paddedTotal: plan.paddedTotal,
      paper: { width: 297, height: 210 },
      bookSize: BOOK,
      bleedMm: 3,
      gutterMm: 0,
      safeAreaMm: 12,
      marks: MARKS,
      binding: "booklet",
      creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Layout tidak muat pada kertas/);
  });
});

function pagesOf(n: number): PageInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    originalIndex: i + 1,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 420,
    heightPt: 595,
  }));
}

async function source(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    doc.addPage([420, 595]).drawRectangle({ x: 20, y: 20, width: 380, height: 555 });
  }
  return doc.save();
}

/**
 * Move/line coordinates of one page, read back from a SAVED document: pdf-lib
 * only flushes a page's drawing operators on save, so a live page has nothing
 * to read. A stream that cannot be found is an error, never a silent [].
 */
function opsOnPage(doc: PDFDocument, pageIndex: number): [number, number][] {
  const node = doc.getPage(pageIndex).node;
  const contents = node.lookup(PDFName.of("Contents"));
  // A page with no Contents key drew nothing at all. That is a real, assertable
  // outcome ("the mark was skipped"), unlike failing to read an existing stream.
  if (contents === undefined) return [];
  const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
  const items: unknown[] = [];
  if (resolved instanceof PDFArray) {
    for (let i = 0; i < resolved.size(); i++) items.push(doc.context.lookup(resolved.get(i)));
  } else {
    items.push(resolved);
  }
  const text = items
    .filter((item): item is PDFRawStream => item instanceof PDFRawStream)
    .map((stream) => {
      const bytes = Buffer.from(stream.contents);
      return Buffer.from(bytes[0] === 0x78 ? inflateSync(bytes) : bytes).toString("latin1");
    })
    .join("\n");
  if (!text) throw new Error("opsOnPage: halaman punya stream tapi tidak ada satu pun koordinat — tes ini cuma pareceru hijau");
  const out: [number, number][] = [];
  for (const match of text.matchAll(/(-?[\d.]+) (-?[\d.]+) (?:m|l)\b/g)) {
    out.push([parseFloat(match[1]), parseFloat(match[2])]);
  }
  return out;
}
