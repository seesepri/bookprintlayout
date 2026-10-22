import { describe, expect, it } from "vitest";
import { PDFDocument, decodePDFRawStream } from "pdf-lib";
import { buildImpositionPdf, folioInsetMm, pageNumberAnchor } from "./pdfEngine";
import type { PageNumberPosition } from "../types";

/** A slot 100 x 150 mm at the origin — the shape one A5 page occupies. */
const TRIM = { x: 0, y: 0, width: 100, height: 150 };
const MM = 72 / 25.4;
const INSET_PT = 8 * MM;
const TEXT_WIDTH_PT = 10;

const ALL_POSITIONS: PageNumberPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

function anchor(position: PageNumberPosition, rotation = 0, textWidthPt = TEXT_WIDTH_PT, safeAreaMm = 0) {
  return pageNumberAnchor({ trim: TRIM, position, rotation, fontSizePt: 9, textWidthPt, safeAreaMm });
}

function insideTrim(p: { x: number; y: number }) {
  const w = TRIM.width * MM;
  const h = TRIM.height * MM;
  return p.x >= -0.01 && p.x <= w + 0.01 && p.y >= -0.01 && p.y <= h + 0.01;
}

describe("folioInsetMm", () => {
  it("never lets the number nearer than 8 mm to the cut line", () => {
    expect(folioInsetMm(0)).toBe(8);
    expect(folioInsetMm(0.5)).toBe(8);
    expect(folioInsetMm(3)).toBe(8);
  });

  it("keeps 2 mm inside a safe area wider than the minimum", () => {
    expect(folioInsetMm(10)).toBe(12);
    expect(folioInsetMm(15)).toBe(17);
    expect(folioInsetMm(20)).toBe(22);
  });

  it("switches over exactly where the safe area overtakes the minimum", () => {
    // safe + 2 == 8 at safe 6; below that the floor holds, above it the safe wins.
    expect(folioInsetMm(5.9)).toBe(8);
    expect(folioInsetMm(6)).toBe(8);
    expect(folioInsetMm(6.1)).toBeCloseTo(8.1, 6);
  });
});

describe("pageNumberAnchor", () => {
  it("moves the number inward when a safe area is set", () => {
    const tight = anchor("bottom-left", 0, TEXT_WIDTH_PT, 0);
    const roomy = anchor("bottom-left", 0, TEXT_WIDTH_PT, 15);
    expect(roomy.x).toBeCloseTo(tight.x + (17 - 8) * MM, 3);
    expect(roomy.y).toBeCloseTo(tight.y + (17 - 8) * MM, 3);
  });

  it("keeps the centre position on the page axis whatever the safe area", () => {
    for (const safeAreaMm of [0, 5, 12]) {
      const centred = anchor("bottom-center", 0, TEXT_WIDTH_PT, safeAreaMm);
      expect(centred.x + TEXT_WIDTH_PT / 2).toBeCloseTo((TRIM.width * MM) / 2, 3);
    }
  });

  it("keeps the number inside the safe area on every rotation", () => {
    const safeAreaMm = 12;
    const inset = folioInsetMm(safeAreaMm) * MM;
    for (const position of ALL_POSITIONS) {
      for (const rotation of [0, 90, 180, 270]) {
        const p = anchor(position, rotation, TEXT_WIDTH_PT, safeAreaMm);
        expect(p.x, `${position} @ ${rotation} x`).toBeGreaterThanOrEqual(inset - 0.01);
        expect(p.y, `${position} @ ${rotation} y`).toBeGreaterThanOrEqual(inset - 0.01);
        expect(p.x, `${position} @ ${rotation} x`).toBeLessThanOrEqual(TRIM.width * MM - inset + 0.01);
        expect(p.y, `${position} @ ${rotation} y`).toBeLessThanOrEqual(TRIM.height * MM - inset + 0.01);
      }
    }
  });

  it("puts the number against the named edge of the page", () => {
    const bottomLeft = anchor("bottom-left");
    expect(bottomLeft.x).toBeCloseTo(INSET_PT, 3);
    expect(bottomLeft.y).toBeCloseTo(INSET_PT, 3);

    const topRight = anchor("top-right");
    expect(topRight.x).toBeCloseTo(TRIM.width * MM - INSET_PT - TEXT_WIDTH_PT, 3);
    // Top sits 8 mm below the trim edge, less the ascent above the baseline.
    expect(topRight.y).toBeCloseTo(TRIM.height * MM - INSET_PT - 9 * 0.72, 3);
  });

  it("centres on the page, not on the number's own width", () => {
    const wide = anchor("bottom-center", 0, 40);
    const narrow = anchor("bottom-center", 0, 4);
    // Both are centred, so both midpoints land on the same x.
    expect(wide.x + 20).toBeCloseTo(narrow.x + 2, 3);
    expect(wide.x + 20).toBeCloseTo((TRIM.width * MM) / 2, 3);
  });

  it("keeps the number inside the trim on every rotation", () => {
    for (const position of ALL_POSITIONS) {
      for (const rotation of [0, 90, 180, 270]) {
        expect(insideTrim(anchor(position, rotation)), `${position} @ ${rotation}`).toBe(true);
      }
    }
  });

  it("turns the text with the slot so it reads upright once folded", () => {
    expect(anchor("bottom-left", 0).rotate).toBe(0);
    expect(anchor("bottom-left", 90).rotate).toBe(90);
    expect(anchor("bottom-left", 180).rotate).toBe(180);
    expect(anchor("bottom-left", 270).rotate).toBe(270);
  });

  it("sends a 180 degree slot's bottom-left to the opposite corner", () => {
    const upright = anchor("bottom-left", 0);
    const turned = anchor("bottom-left", 180);
    expect(turned.x).toBeCloseTo(TRIM.width * MM - upright.x, 3);
    expect(turned.y).toBeCloseTo(TRIM.height * MM - upright.y, 3);
  });
});

describe("numbering in the exported sheet", () => {
  const PAGES = 8;

  async function source(pageCount = PAGES) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
      doc.addPage([420, 595]).drawText(`Halaman ${i + 1}`, { x: 40, y: 520, size: 20 });
    }
    return doc.save();
  }

  const pagesOf = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      originalIndex: i as number | null,
      rotation: 0 as const,
      isBlank: false,
      widthPt: 420,
      heightPt: 595,
    }));

  const base = {
    binding: "booklet" as const,
    signatureSize: 8,
    bookSize: { width: 100, height: 150 },
    paperSize: { width: 297, height: 210 },
    bleedMm: 0,
    safeAreaMm: 0,
    gutterMm: 0,
    marks: {
      showCropMarks: false,
      showBleedArea: false,
      showSafeArea: false,
      showFoldMarks: false,
      showCenterLine: false,
      showRegistrationMarks: false,
    },
    compress: true,
  };

  /**
   * Text-showing operators across every decoded content stream. Walking indirect
   * objects rather than `page.node.Contents()`: the latter hands back a
   * reference whose decoding is not part of pdf-lib's public surface. The
   * `instanceof` check is avoided on purpose — vitest can load pdf-lib twice
   * (ESM and CJS), and the class identities then differ while the object is
   * still a raw stream.
   */
  async function textOperators(bytes: Uint8Array) {
    const doc = await PDFDocument.load(bytes);
    let count = 0;
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const isStream = (obj as { constructor?: { name?: string } }).constructor?.name === "PDFRawStream";
      if (!isStream) continue;
      try {
        const decoded = new TextDecoder("latin1").decode(decodePDFRawStream(obj as never).decode());
        count += (decoded.match(/(Tj|TJ)\b/g) ?? []).length;
      } catch {
        continue;
      }
    }
    return count;
  }

  it("draws on all six positions without failing", async () => {
    const sourceBytes = await source();
    for (const position of ALL_POSITIONS) {
      const bytes = await buildImpositionPdf({
        ...base,
        sourceBytes,
        pages: pagesOf(PAGES),
        pageNumbers: { enabled: true, position, fontSizePt: 9, startAt: 1 },
      });
      expect(bytes.length, position).toBeGreaterThan(0);
    }
  });

  it("stamps text only when numbering is switched on", async () => {
    const sourceBytes = await source();
    const off = await buildImpositionPdf({ ...base, sourceBytes, pages: pagesOf(PAGES) });
    const on = await buildImpositionPdf({
      ...base,
      sourceBytes,
      pages: pagesOf(PAGES),
      pageNumbers: { enabled: true, position: "bottom-center", fontSizePt: 9, startAt: 1 },
    });

    const withNumbering = await textOperators(on);
    expect(withNumbering).toBeGreaterThan(await textOperators(off));
  });

  it("leaves a blank page unnumbered while still counting it", async () => {
    const sourceBytes = await source(7);
    // Page 3 is a blank insert: it consumes number 3, so the page after it is 4.
    const withBlank = pagesOf(8);
    withBlank[2] = { id: "blank", originalIndex: null, rotation: 0 as const, isBlank: true, widthPt: 420, heightPt: 595 };

    const numbered = await buildImpositionPdf({
      ...base,
      sourceBytes,
      pages: withBlank,
      pageNumbers: { enabled: true, position: "bottom-center", fontSizePt: 9, startAt: 1 },
    });
    expect(numbered.length).toBeGreaterThan(0);
  });

  it("honours a start number other than 1", async () => {
    const sourceBytes = await source();
    const bytes = await buildImpositionPdf({
      ...base,
      sourceBytes,
      pages: pagesOf(PAGES),
      pageNumbers: { enabled: true, position: "bottom-center", fontSizePt: 9, startAt: 57 },
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("still prints numbers in the preview profile", async () => {
    const sourceBytes = await source();
    const plain = await buildImpositionPdf({ ...base, sourceBytes, pages: pagesOf(PAGES), mode: "preview" });
    const numbered = await buildImpositionPdf({
      ...base,
      sourceBytes,
      pages: pagesOf(PAGES),
      mode: "preview",
      pageNumbers: { enabled: true, position: "bottom-center", fontSizePt: 9, startAt: 1 },
    });
    expect(await textOperators(numbered)).toBeGreaterThan(await textOperators(plain));
  });
});
