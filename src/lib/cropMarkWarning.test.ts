import { describe, expect, it } from "vitest";
import { validateImposition } from "./geometry";
import { planImposition } from "./imposition";
import type { PageInfo } from "../types";

const pages: PageInfo[] = Array.from({ length: 16 }, (_, i) => ({
  id: `p${i}`,
  originalIndex: i,
  rotation: 0 as const,
  isBlank: false,
  widthPt: 419.53,
  heightPt: 595.28,
  thumbnail: "data:,",
}));

const MARKS = {
  showCropMarks: true,
  showBleedArea: false,
  showSafeArea: false,
  showFoldMarks: false,
  showCenterLine: false,
  showRegistrationMarks: false,
};

const A3 = { width: 297, height: 420 };

function validate(bookSize: { width: number; height: number }, paper = A3) {
  const plan = planImposition(16, "perfect-binding", 16, "left", { slotsPerSide: 4 });
  return validateImposition({
    pages,
    sheets: plan.sheets,
    sheetCount: plan.sheets.length,
    signatureSheetCounts: plan.signatureSheetCounts,
    paddedTotal: 16,
    paper,
    bookSize,
    bleedMm: 0,
    gutterMm: 0,
    safeAreaMm: 0,
    marks: MARKS as never,
    binding: "perfect-binding",
    creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
    grid: { cols: 2, rows: 2 } as never,
  } as never);
}

const markWarnings = (w: string[]) => w.filter((line) => /crop mark/i.test(line));

describe("finding C — the crop mark warning matches what is drawn", () => {
  it("does not claim marks are skipped when the block fills the sheet", () => {
    // A5 on A3: block 296 x 420 on a 297 x 420 sheet. The old message said the
    // marks "akan dilewati" (will be skipped) while four inward lines were in
    // fact printed inside the artwork.
    const { warnings } = validate({ width: 148, height: 210 });
    const line = markWarnings(warnings).join(" ");
    expect(line).not.toMatch(/akan dilewati/i);
    expect(line).toMatch(/tepi kertas/i);
  });

  it("names the side that has no room, with the room it actually has", () => {
    const { warnings } = validate({ width: 148, height: 210 });
    const line = markWarnings(warnings).join(" ");
    // 0,5 mm either side of the block, nothing above or below it.
    expect(line).toMatch(/kiri-kanan 0\.5 mm/);
    expect(line).toMatch(/atas-bawah 0\.0 mm/);
    expect(line).toMatch(/butuh 7\.0 mm/);
  });

  it("stays quiet when the sheet has room for full marks", () => {
    // A6 on A3 leaves 43,5 mm at the sides and 62 mm top and bottom.
    const { warnings } = validate({ width: 105, height: 148 });
    expect(markWarnings(warnings)).toEqual([]);
  });

  it("never contradicts the layout error when the block itself does not fit", () => {
    // A gutter that widens the block past the sheet is an error, and the mark
    // warning must not pretend the same situation is a mere warning.
    const plan = planImposition(16, "perfect-binding", 16, "left", { slotsPerSide: 4 });
    const result = validateImposition({
      pages,
      sheets: plan.sheets,
      sheetCount: plan.sheets.length,
      signatureSheetCounts: plan.signatureSheetCounts,
      paddedTotal: 16,
      paper: A3,
      bookSize: { width: 148, height: 210 },
      bleedMm: 0,
      gutterMm: 6,
      safeAreaMm: 0,
      marks: MARKS as never,
      binding: "perfect-binding",
      creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0 },
      grid: { cols: 2, rows: 2 } as never,
    } as never);
    expect(result.errors.join(" ")).toMatch(/tidak muat/i);
  });
});
