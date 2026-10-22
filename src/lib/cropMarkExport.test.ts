import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream, PDFRef, PDFArray } from "pdf-lib";
import { buildImpositionPdf } from "./pdfEngine";
import type { PageInfo } from "../types";

const MM = 72 / 25.4;
const MARKS = {
  showCropMarks: true, showBleedArea: false, showSafeArea: false,
  showFoldMarks: false, showCenterLine: false, showRegistrationMarks: false,
};
const pagesOf = (n: number): PageInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, originalIndex: i + 1, rotation: 0 as const, isBlank: false, widthPt: 420, heightPt: 595 }));

async function source(n: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([420, 595]).drawRectangle({ x: 20, y: 20, width: 380, height: 555 });
  return doc.save();
}
function segments(doc: PDFDocument, i: number) {
  const node = doc.getPage(i).node;
  const contents = node.lookup(PDFName.of("Contents"));
  if (contents === undefined) return [] as number[][];
  const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
  const items: unknown[] = [];
  if (resolved instanceof PDFArray) for (let k = 0; k < resolved.size(); k++) items.push(doc.context.lookup(resolved.get(k)));
  else items.push(resolved);
  const text = items.filter((x): x is PDFRawStream => x instanceof PDFRawStream)
    .map((s) => { const b = Buffer.from(s.contents); return Buffer.from(b[0] === 0x78 ? inflateSync(b) : b).toString("latin1"); })
    .join("\n");
  const out: number[][] = [];
  let prev: [number, number] | null = null;
  for (const m of text.matchAll(/(-?[\d.]+) (-?[\d.]+) (m|l)\b/g)) {
    const pt: [number, number] = [parseFloat(m[1]), parseFloat(m[2])];
    if (m[3] === "m") { prev = pt; continue; }
    if (prev) out.push([prev[0], prev[1], pt[0], pt[1]]);
    prev = pt;
  }
  return out;
}

describe("exported 4-up sheet — no mark lands inside the artwork", () => {
  it("keeps every mark outside the trim block and inside the media box", async () => {
    for (const [label, book] of [
      ["A5 on A3 (block fills the sheet)", { width: 148, height: 210 }],
      ["A6 on A3 (room around the block)", { width: 105, height: 148 }],
    ] as const) {
      const bytes = await buildImpositionPdf({
        sourceBytes: await source(16), pages: pagesOf(16),
        binding: "perfect-binding", signatureSize: 16, bookSize: book,
        paperSize: { width: 297, height: 420 },
        bleedMm: 0, safeAreaMm: 0, gutterMm: 0,
        marks: MARKS as never,
        creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
        grid: { cols: 2, rows: 2 } as never,
      });
      const doc = await PDFDocument.load(bytes);
      const segs = segments(doc, 0);
      const W = 297 * MM, H = 420 * MM;
      const blockW = book.width * 2, blockH = book.height * 2;
      const bx = (W - blockW * MM) / 2, by = (H - blockH * MM) / 2;
      const inside = segs.filter(([x1, y1, x2, y2]) => {
        const mx = Math.min(x1, x2), Mx = Math.max(x1, x2);
        const my = Math.min(y1, y2), My = Math.max(y1, y2);
        // segmen dianggap "di dalam artwork" bila kedua ujungnya masuk blok
        return mx > bx + 0.5 && Mx < bx + blockW * MM - 0.5 && my > by + 0.5 && My < by + blockH * MM - 0.5;
      });
      const outside = segs.filter(([x1, y1]) => x1 < 0 || x1 > W || y1 < 0 || y1 > H);
      // Nama label dipakai di pesan kegagalan supaya kasus mana yang bocor jelas.
      expect(inside.length, `${label}: ada ${inside.length} segmen di dalam artwork`).toBe(0);
      expect(outside.length, `${label}: ada ${outside.length} segmen di luar media box`).toBe(0);
      // A block that fills the sheet leaves no room at all, so zero marks is the
      // correct outcome there; with room around it, the marks must be present.
      if (book.width === 105) {
        expect(segs.length, `${label}: crop marks hilang padahal ada ruang`).toBeGreaterThan(0);
      }
    }
  });
});

describe("exported 4-up sheet — row boundary has two ticks, never a line across", () => {
  it("puts one tick in each margin and nothing across the block", async () => {
    const bytes = await buildImpositionPdf({
      sourceBytes: await source(16),
      pages: pagesOf(16),
      binding: "perfect-binding",
      signatureSize: 16,
      bookSize: { width: 105, height: 148 },
      paperSize: { width: 297, height: 420 },
      bleedMm: 0,
      safeAreaMm: 0,
      gutterMm: 0,
      marks: MARKS as never,
      creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
      grid: { cols: 2, rows: 2 } as never,
    });
    const doc = await PDFDocument.load(bytes);
    const segs = segments(doc, 0);
    const MM = 72 / 25.4;
    const boundary = 210 * MM;
    const onBoundary = segs.filter(
      (s) => Math.abs(s[1] - s[3]) < 0.01 && Math.abs(s[1] - boundary) < 0.5
    );
    // Two short ticks (one per side), each 5 mm long — not one long rule.
    expect(onBoundary).toHaveLength(2);
    for (const [x1, , x2] of onBoundary) expect(Math.abs(x2 - x1)).toBeCloseTo(5 * MM, 1);
  });
});
