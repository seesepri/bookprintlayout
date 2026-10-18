import { describe, expect, it } from "vitest";
import { computePerfectBindingSheets, planImposition } from "./imposition";
import { buildSheetGeometry, validateImposition } from "./geometry";
import { QUAD_GRID } from "./nup";
import { hiResWidthFor, shouldRenderHiRes, thumbnailFormatFor } from "./previewHelpers";
import type { MarksSettings, PageInfo } from "../types";

const A5 = { width: 148, height: 210 };
const A3_PORTRAIT = { width: 297, height: 420 };
const MARKS_ON: MarksSettings = {
  showCropMarks: true,
  showBleedArea: false,
  showSafeArea: false,
  showFoldMarks: false,
  showCenterLine: false,
  showRegistrationMarks: false,
};
const MARKS_OFF: MarksSettings = { ...MARKS_ON, showCropMarks: false };

function pages(count: number): PageInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    originalIndex: i,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 419.53,
    heightPt: 595.28,
  }));
}

describe("perfect binding with four slots per side", () => {
  it("keeps reading order across the grid and doubles the density", () => {
    const sheets = computePerfectBindingSheets(16, "left", 4);
    expect(sheets).toHaveLength(2);
    expect(sheets[0].frontSlots).toEqual([1, 2, 3, 4]);
    expect(sheets[0].backSlots).toEqual([5, 6, 7, 8]);
    expect(sheets[1].frontSlots).toEqual([9, 10, 11, 12]);
    expect(sheets[1].backSlots).toEqual([13, 14, 15, 16]);
    // The legacy spread fields still describe the first row, so every older
    // reader of a sheet keeps seeing a real spread.
    expect(sheets[0].front).toEqual({ left: 1, right: 2 });
  });

  it("pads to a multiple of slots per sheet, not of four", () => {
    expect(planImposition(14, "perfect-binding", 16, "left", { slotsPerSide: 4 }).paddedTotal).toBe(16);
    expect(planImposition(14, "perfect-binding", 16, "left", { slotsPerSide: 4 }).sheets).toHaveLength(2);
    expect(planImposition(14, "perfect-binding", 16, "left").paddedTotal).toBe(16);
    expect(planImposition(14, "perfect-binding", 16, "left").sheets).toHaveLength(4);
  });

  it("mirrors the row for right-to-left binding", () => {
    expect(computePerfectBindingSheets(8, "right", 4)[0].frontSlots).toEqual([4, 3, 2, 1]);
  });

  it("densifies a folded binding only on an explicit request, by stacking two known-good spreads", () => {
    const plan = planImposition(16, "booklet", 16, "left", { slotsPerSide: 4 });
    // 8 pages per sheet instead of 4, so 16 pages need 2 sheets.
    expect(plan.sheets).toHaveLength(2);
    expect(plan.paddedTotal).toBe(16);
    // Band atas = spread sheet 2-up pertama, band bawah = sheet keduanya,
    // persis seperti computeBookletSheets — tidak ada urutan yang dikarang ulang.
    expect(plan.sheets[0].frontSlots).toEqual([16, 1, 14, 3]);
    expect(plan.sheets[0].backSlots).toEqual([2, 15, 4, 13]);
    // The spread fields still read the old way for anything that only knows 2-up.
    expect(plan.sheets[0].front).toEqual({ left: 16, right: 1 });
    // A padded count that is not a multiple of 8 gets blank pages, never a sheet
    // with one band missing.
    const odd = planImposition(28, "saddle-stitch", 16, "left", { slotsPerSide: 4 });
    expect(odd.sheets).toHaveLength(4);
    expect(odd.paddedTotal).toBe(32);
    expect(odd.sheets.every((s) => s.frontSlots?.length === 4)).toBe(true);
  });

  it("keeps a nested signature book on the spread it has always used", () => {
    const plan = planImposition(16, "signature", 8, "left", { slotsPerSide: 4 });
    expect(plan.sheets.every((s) => s.frontSlots === undefined)).toBe(true);
  });
});

describe("2x2 sheet geometry", () => {
  const base = {
    paper: A3_PORTRAIT,
    bookSize: A5,
    bleedMm: 0,
    gutterMm: 0,
    safeAreaMm: 0,
    binding: "perfect-binding" as const,
    pages: pages(16),
    marks: MARKS_ON,
  };
  const sheet = computePerfectBindingSheets(16, "left", 4)[0];

  it("fills the A3 portrait exactly: two columns of 148 mm, two rows of 210 mm", () => {
    const g = buildSheetGeometry({ ...base, sheet, grid: QUAD_GRID });
    const trims = (g.frontSlots ?? []).map((p) => p.trim);
    expect(trims).toHaveLength(4);
    // Geometry is millimetres from the bottom-left, so the first visual row is
    // the one with the larger y.
    expect(trims[0]).toEqual({ x: 0.5, y: 210, width: 148, height: 210 });
    expect(trims[1]).toEqual({ x: 148.5, y: 210, width: 148, height: 210 });
    expect(trims[2]).toEqual({ x: 0.5, y: 0, width: 148, height: 210 });
    expect(trims[3]).toEqual({ x: 148.5, y: 0, width: 148, height: 210 });
    const area = (r: { x: number; y: number; width: number; height: number }) => r.width * r.height;
    expect(trims.reduce((sum, r) => sum + area(r), 0)).toBeCloseTo(4 * 148 * 210, 6);
  });

  it("puts one crop mark pair on the internal row boundary, tick only", () => {
    const g = buildSheetGeometry({ ...base, sheet, grid: QUAD_GRID });
    expect(g.cropMarks).toHaveLength(6);
    expect(g.cropMarks.filter((m) => m.dy === 0)).toHaveLength(2);
    expect(g.cropMarks.filter((m) => m.dy === 0).every((m) => m.y === 210)).toBe(true);
  });

  it("adds the gutter between the columns, never between the rows", () => {
    const g = buildSheetGeometry({ ...base, sheet, gutterMm: 6, grid: QUAD_GRID });
    const trims = g.frontSlots ?? [];
    expect(trims[1].trim.x - (trims[0].trim.x + trims[0].trim.width)).toBeCloseTo(6, 6);
    expect(trims[0].trim.y - (trims[2].trim.y + trims[2].trim.height)).toBeCloseTo(0, 6);
  });

  it("accepts a 4-up plan on A3 and rejects one that does not fit", () => {
    const plan = planImposition(16, "perfect-binding", 16, "left", { slotsPerSide: 4 });
    const ok = validateImposition({
      pages: pages(16),
      sheets: plan.sheets,
      sheetCount: plan.sheets.length,
      signatureSheetCounts: plan.signatureSheetCounts,
      paddedTotal: plan.paddedTotal,
      paper: A3_PORTRAIT,
      bookSize: A5,
      bleedMm: 0,
      gutterMm: 0,
      safeAreaMm: 0,
      marks: MARKS_OFF,
      binding: "perfect-binding",
      grid: QUAD_GRID,
    });
    expect(ok.errors).toEqual([]);
    expect(ok.valid).toBe(true);

    const tight = validateImposition({ ...okArgs(), bleedMm: 3, marks: MARKS_OFF });
    expect(tight.valid).toBe(false);
    expect(tight.errors.join(" ")).toMatch(/tidak muat/);
  });

  it("accepts the 4-up sheet with crop marks on, warning that they are skipped", () => {
    const plan = planImposition(16, "perfect-binding", 16, "left", { slotsPerSide: 4 });
    const v = validateImposition({
      pages: pages(16),
      sheets: plan.sheets,
      sheetCount: plan.sheets.length,
      signatureSheetCounts: plan.signatureSheetCounts,
      paddedTotal: plan.paddedTotal,
      paper: A3_PORTRAIT,
      bookSize: A5,
      bleedMm: 0,
      gutterMm: 0,
      safeAreaMm: 0,
      marks: MARKS_ON,
      binding: "perfect-binding",
      grid: QUAD_GRID,
    });
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/Crop marks tidak punya ruang/);
  });

  it("still demands mark room for a spread — the pair rule is untouched", () => {
    const plan = planImposition(8, "perfect-binding", 8, "left");
    const v = validateImposition({
      pages: pages(8),
      sheets: plan.sheets,
      sheetCount: plan.sheets.length,
      signatureSheetCounts: plan.signatureSheetCounts,
      paddedTotal: plan.paddedTotal,
      paper: A3_PORTRAIT,
      bookSize: A5,
      bleedMm: 0,
      gutterMm: 0,
      safeAreaMm: 0,
      marks: MARKS_ON,
      binding: "perfect-binding",
    });
    // 2 x 148 + 2 x 7 mm = 310 mm on a 297 mm sheet: rejected, as it has always been.
    expect(v.valid).toBe(false);
    expect(v.errors.join(" ")).toMatch(/tidak muat/);
  });

  it("keeps the classic spread byte-for-byte the same shape as before", () => {
    const g = buildSheetGeometry({ ...base, sheet: planImposition(8, "perfect-binding").sheets[0] });
    expect(g.frontSlots).toBeUndefined();
    expect(g.backSlots).toBeUndefined();
    expect(g.grid).toBeUndefined();
    expect(g.cropMarks.every((m) => m.dy !== 0)).toBe(true);
    // A3 portrait (297) minus a 2x148 spread leaves 0.5 mm on each side.
    expect(g.front.left.trim).toEqual({ x: 0.5, y: 105, width: 148, height: 210 });
    expect(g.cropMarks).toHaveLength(4);
    expect(g.paper).toEqual(A3_PORTRAIT);
  });
});

function okArgs() {
  const plan = planImposition(16, "perfect-binding", 16, "left", { slotsPerSide: 4 });
  return {
    pages: pages(16),
    sheets: plan.sheets,
    sheetCount: plan.sheets.length,
    signatureSheetCounts: plan.signatureSheetCounts,
    paddedTotal: plan.paddedTotal,
    paper: A3_PORTRAIT,
    bookSize: A5,
    gutterMm: 0,
    safeAreaMm: 0,
    binding: "perfect-binding" as const,
    grid: QUAD_GRID,
  };
}

describe("hi-res preview sizing", () => {
  it("asks for what the screen really has, capped", () => {
    // 148 mm of A5 page at 2.6 px/mm, zoom 1, DPR 2 -> 770 px.
    expect(hiResWidthFor(148, 2.6 * 1, 2)).toBe(770);
    expect(hiResWidthFor(148, 2.6 * 6, 2)).toBe(2600); // capped
    // A 1x display still gets 2x the CSS size: at 230 CSS px a 230 px raster is
    // the thumbnail the preview was supposed to replace, which is why the first
    // version of this fix left the sheet looking unchanged.
    expect(hiResWidthFor(148, 1.55, 1)).toBe(459);
    expect(hiResWidthFor(148, 1.55, 1, 2600, 1)).toBe(230);
    expect(thumbnailFormatFor(459).format).toBe("png");
    expect(thumbnailFormatFor(1400).format).toBe("png");
    expect(thumbnailFormatFor(1401)).toEqual({ format: "jpeg", quality: 0.92 });
    expect(hiResWidthFor(0, 2.6, 2)).toBe(0);
    expect(hiResWidthFor(Number.NaN, 2.6, 2)).toBe(0);
  });

  it("only chases a materially sharper target", () => {
    expect(shouldRenderHiRes(undefined, 500)).toBe(true);
    expect(shouldRenderHiRes(500, 500)).toBe(false);
    expect(shouldRenderHiRes(500, 600)).toBe(false);
    expect(shouldRenderHiRes(500, 700)).toBe(true);
    expect(shouldRenderHiRes(500, 0)).toBe(false);
  });
});
