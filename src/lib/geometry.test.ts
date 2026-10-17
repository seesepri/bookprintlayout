import { describe, expect, it } from "vitest";
import { buildSheetGeometry, validateImposition } from "./geometry";
import { planImposition } from "./imposition";
import { MarksSettings, PageInfo, SizeMM } from "../types";

const BOOK: SizeMM = { width: 148, height: 210 }; // A5
const PAPER: SizeMM = { width: 420, height: 297 }; // A3 landscape
const MARKS: MarksSettings = {
  showCropMarks: true,
  showBleedArea: true,
  showSafeArea: false,
  showFoldMarks: true,
  showCenterLine: false,
  showRegistrationMarks: false,
};

function pagesOf(count: number): PageInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i + 1}`,
    originalIndex: i,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 419.5,
    heightPt: 595,
  }));
}

function validateFor(count: number, overrides: Partial<Parameters<typeof validateImposition>[0]> = {}) {
  const plan = planImposition(count, "booklet", 16);
  return validateImposition({
    pages: pagesOf(count),
    sheets: plan.sheets,
    sheetCount: plan.sheets.length,
    signatureSheetCounts: plan.signatureSheetCounts,
    paddedTotal: plan.paddedTotal,
    paper: PAPER,
    bookSize: BOOK,
    bleedMm: 3,
    gutterMm: 4,
    safeAreaMm: 5,
    marks: MARKS,
    binding: "booklet",
    creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
    ...overrides,
  });
}

describe("validateImposition", () => {
  it("accepts a padded booklet — the filler pages are allowed to be absent", () => {
    // 10 real pages pad to 12; pages 11 and 12 are virtual and must NOT be
    // reported as missing, or every book with a length that is not a multiple
    // of 4 becomes un-exportable.
    const result = validateFor(10);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("accepts every length from 1 to 40 for every binding", () => {
    for (let count = 1; count <= 40; count++) {
      for (const binding of ["booklet", "saddle-stitch", "perfect-binding", "signature"] as const) {
        const plan = planImposition(count, binding, 8);
        const result = validateImposition({
          pages: pagesOf(count),
          sheets: plan.sheets,
          sheetCount: plan.sheets.length,
          signatureSheetCounts: plan.signatureSheetCounts,
          paddedTotal: plan.paddedTotal,
          paper: PAPER,
          bookSize: BOOK,
          bleedMm: 3,
          gutterMm: 4,
          safeAreaMm: 5,
          marks: MARKS,
          binding,
          creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
        });
        expect(result.errors, `${binding}/${count}: ${result.errors.join(" | ")}`).toEqual([]);
      }
    }
  });

  it("rejects a sheet that is too small for the spread, and says how much", () => {
    const result = validateFor(8, { paper: { width: 210, height: 297 } });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Required .* × .* mm, selected 210\.0 × 297\.0 mm/);
  });

  it("rejects NaN and negative geometry", () => {
    expect(validateFor(8, { bleedMm: NaN }).errors.join(" ")).toMatch(/tidak boleh bernilai negatif/);
    expect(validateFor(8, { gutterMm: -2 }).errors.join(" ")).toMatch(/tidak boleh bernilai negatif/);
  });

  it("rejects a zero-size custom book", () => {
    const result = validateFor(8, { bookSize: { width: 0, height: 0 } });
    expect(result.errors.join(" ")).toMatch(/Ukuran buku\/trim tidak valid/);
  });

  it("warns when the source pages are not all the same size", () => {
    const pages = pagesOf(4);
    pages[2] = { ...pages[2], widthPt: 500 };
    const plan = planImposition(4, "booklet", 16);
    const result = validateImposition({
      pages,
      sheets: plan.sheets,
      sheetCount: plan.sheets.length,
      signatureSheetCounts: plan.signatureSheetCounts,
      paddedTotal: plan.paddedTotal,
      paper: PAPER,
      bookSize: BOOK,
      bleedMm: 3,
      gutterMm: 4,
      safeAreaMm: 5,
      marks: MARKS,
      binding: "booklet",
    });
    expect(result.warnings.join(" ")).toMatch(/Ukuran halaman sumber tidak konsisten/);
    expect(result.valid).toBe(true);
  });
});

describe("buildSheetGeometry", () => {
  const sheet = planImposition(16, "booklet", 16).sheets[0];

  it("centres the spread and puts the fold on the sheet centre line", () => {
    const geometry = buildSheetGeometry({
      sheet,
      paper: PAPER,
      bookSize: BOOK,
      bleedMm: 3,
      gutterMm: 4,
      safeAreaMm: 5,
      binding: "booklet",
      pages: pagesOf(16),
      marks: MARKS,
    });
    expect(geometry.front.left.trim.x).toBeCloseTo((420 - 296) / 2, 6);
    expect(geometry.foldX).toBeCloseTo(210, 6);
  });

  it("shifts outer sheets outward when creep is on, and leaves the innermost alone", () => {
    const plan = planImposition(16, "booklet", 16);
    const creep = { paperThicknessMm: 0.1, mode: "auto" as const, manualAmountMm: 0 };
    const base = { paper: PAPER, bookSize: BOOK, bleedMm: 3, gutterMm: 4, safeAreaMm: 5, binding: "booklet" as const, pages: pagesOf(16), marks: MARKS, creep };
    const outer = buildSheetGeometry({ ...base, sheet: plan.sheets[0], signatureSheetCount: 4 });
    const inner = buildSheetGeometry({ ...base, sheet: plan.sheets[3], signatureSheetCount: 4 });

    // Unshifted, the left page starts at (420 - 296) / 2 = 62 mm. Creep moves
    // each side of the spread outward, the two pages parting company.
    expect(outer.front.left.trim.x).toBeCloseTo(62 - 0.6, 6);
    expect(outer.front.right.trim.x).toBeCloseTo(210 + 0.6, 6);
    expect(inner.front.left.trim.x).toBeCloseTo(62, 6);
    expect(inner.front.right.trim.x).toBeCloseTo(210, 6);
    // Crop marks ride along with the shifted trim edge, otherwise the trim
    // would be cut at the wrong place.
    expect(outer.cropMarks[0].x).toBeCloseTo(outer.front.left.trim.x, 6);
    expect(outer.cropMarks[1].x).toBeCloseTo(outer.front.right.trim.x + 148, 6);
  });

  it("adds the gutter as a real gap for perfect binding only", () => {
    const base = { sheet, paper: PAPER, bookSize: BOOK, bleedMm: 3, safeAreaMm: 5, pages: pagesOf(16), marks: MARKS };
    const folded = buildSheetGeometry({ ...base, binding: "booklet", gutterMm: 10 });
    const glued = buildSheetGeometry({ ...base, binding: "perfect-binding", gutterMm: 10 });
    const gap = (g: ReturnType<typeof buildSheetGeometry>) => g.front.right.trim.x - (g.front.left.trim.x + g.front.left.trim.width);
    expect(gap(folded)).toBeCloseTo(0, 6);
    expect(gap(glued)).toBeCloseTo(10, 6);
  });
});
