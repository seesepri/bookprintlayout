import { describe, expect, it } from "vitest";
import { resolveExportOptions } from "./exportOptions";
import { initialState } from "../state/ProjectContext";
import { MarksSettings, PageInfo } from "../types";

const MARKS: MarksSettings = {
  showCropMarks: true,
  showBleedArea: true,
  showSafeArea: true,
  showFoldMarks: true,
  showCenterLine: true,
  showRegistrationMarks: true,
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

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    ...initialState,
    pages: pagesOf(16),
    marks: MARKS,
    bookSizeCustom: { width: 148, height: 210 },
    paperSizeCustom: { width: 420, height: 297 },
    ...overrides,
  } as typeof initialState;
}

const BOOK = { width: 148, height: 210 };
const PAPER = { width: 420, height: 297 };

describe("resolveExportOptions", () => {
  it("keeps the center line when registration marks are turned off", () => {
    // Regression: `includeRegistration` used to gate showCenterLine, so
    // unchecking one silently removed an unrelated guide from the export.
    const state = makeState({
      exportSettings: { ...initialState.exportSettings, includeRegistration: false },
    });
    const resolved = resolveExportOptions(state, BOOK, PAPER);
    expect(resolved.marks.showCenterLine).toBe(true);
    expect(resolved.marks.showRegistrationMarks).toBe(false);
  });

  it("only draws a mark when both the print toggle and the export gate allow it", () => {
    const off = resolveExportOptions(
      makeState({
        marks: { ...MARKS, showCropMarks: false },
        exportSettings: { ...initialState.exportSettings, includeCropMarks: true },
      }),
      BOOK,
      PAPER
    );
    expect(off.marks.showCropMarks).toBe(false);

    const gated = resolveExportOptions(
      makeState({
        marks: { ...MARKS, showCropMarks: true },
        exportSettings: { ...initialState.exportSettings, includeCropMarks: false },
      }),
      BOOK,
      PAPER
    );
    expect(gated.marks.showCropMarks).toBe(false);
  });

  it("strips marks and bleed from the preview format", () => {
    const resolved = resolveExportOptions(
      makeState({ exportSettings: { ...initialState.exportSettings, format: "preview" } }),
      BOOK,
      PAPER
    );
    expect(resolved.bleedMm).toBe(0);
    expect(Object.values(resolved.marks)).toEqual(Array(6).fill(false));
  });

  it("carries the same resolved geometry into validation", () => {
    const resolved = resolveExportOptions(makeState(), BOOK, PAPER);
    expect(resolved.validation.valid).toBe(true);
    expect(resolved.plan.sheets).toHaveLength(4);
    expect(resolved.paper.width).toBeGreaterThanOrEqual(resolved.paper.height);
  });

  it("fails validation when the chosen sheet cannot hold the spread", () => {
    const resolved = resolveExportOptions(makeState(), BOOK, { width: 210, height: 297 });
    expect(resolved.validation.valid).toBe(false);
    expect(resolved.validation.errors.join(" ")).toMatch(/tidak muat pada kertas/);
  });
});

describe("setting that arrives as a string", () => {
  it("keeps a folded booklet at 4-up in the export path", () => {
    // The dropdown stores what <select> gives it ("4"); the export must agree
    // with the preview instead of silently falling back to a spread.
    const state = makeState({
      binding: "booklet",
      orientation: "portrait" as const,
      pagesPerSide: "4" as unknown as 4,
      paperSizePreset: "Custom",
      paperSizeCustom: { width: 324, height: 484 },
    });
    const options = resolveExportOptions(state, BOOK, { width: 324, height: 484 });
    expect(options.grid).toEqual({ cols: 2, rows: 2 });
    expect(options.slotsPerSide).toBe(4);
    expect(options.layoutReason).toBe("quad-forced");
  });
});

