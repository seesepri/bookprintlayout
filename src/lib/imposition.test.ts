import { describe, expect, it } from "vitest";
import {
  blankPagesNeeded,
  computeBookletSheets,
  computeCreepShiftMm,
  computePerfectBindingSheets,
  computeSignatureRanges,
  padToMultiple,
  planImposition,
} from "./imposition";
import { BindingType, PageInfo, Sheet } from "../types";

const BINDINGS: BindingType[] = ["booklet", "saddle-stitch", "perfect-binding", "signature"];

function pagesOf(count: number): PageInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i + 1}`,
    originalIndex: i,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 420,
    heightPt:595,
  }));
}

function allSides(sheets: Sheet[]): (number | null)[] {
  return sheets.flatMap((s) => [s.front.left, s.front.right, s.back.left, s.back.right]);
}

describe("padToMultiple / blankPagesNeeded", () => {
  it("rounds up to the next multiple and leaves exact multiples alone", () => {
    expect(padToMultiple(10, 4)).toBe(12);
    expect(padToMultiple(12, 4)).toBe(12);
    expect(padToMultiple(0, 4)).toBe(0);
    expect(padToMultiple(7, 0)).toBe(7);
    expect(blankPagesNeeded(10, 4)).toBe(2);
  });
});

describe("computeBookletSheets", () => {
  it("matches the classic 16-page booklet order documented in the README", () => {
    const sheets = computeBookletSheets(16);
    expect(
      sheets.map((s) => [s.front.left, s.front.right, s.back.left, s.back.right])
    ).toEqual([
      [16, 1, 2, 15],
      [14, 3, 4, 13],
      [12, 5, 6, 11],
      [10, 7, 8, 9],
    ]);
  });

  it("keeps padding virtual instead of inventing page numbers", () => {
    // 10 real pages -> 12 slots; the 2 filler slots must be null, never 11/12.
    const sheets = computeBookletSheets(10);
    expect(sheets).toHaveLength(3);
    expect(allSides(sheets).filter((n) => n === null)).toHaveLength(2);
    expect(allSides(sheets).filter((n) => n !== null && n > 10)).toEqual([]);
  });

  it("mirrors both sides for right-to-left binding", () => {
    const ltr = computeBookletSheets(16, 1, 0, "left");
    const rtl = computeBookletSheets(16, 1, 0, "right");
    expect(rtl[0].front).toEqual({ left: ltr[0].front.right, right: ltr[0].front.left });
    expect(rtl[0].back).toEqual({ left: ltr[0].back.right, right: ltr[0].back.left });
  });

  it("offsets page numbers so a signature keeps its global numbering", () => {
    const sheets = computeBookletSheets(4, 2, 8);
    expect(sheets[0].front).toEqual({ left: 12, right: 9 });
  });
});

describe("computePerfectBindingSheets", () => {
  it("fills the back of the sheet instead of wasting it", () => {
    const sheets = computePerfectBindingSheets(4);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].front).toEqual({ left: 1, right: 2 });
    expect(sheets[0].back).toEqual({ left: 3, right: 4 });
  });

  it("leaves an empty back side when the run is shorter than one sheet", () => {
    const sheets = computePerfectBindingSheets(2);
    expect(sheets[0].front).toEqual({ left: 1, right: 2 });
    expect(sheets[0].back).toEqual({ left: null, right: null });
  });
});

describe("computeSignatureRanges", () => {
  it("splits on the signature size and rounds odd sizes down to a multiple of 4", () => {
    expect(computeSignatureRanges(20, 16).map((r) => [r.startPage, r.endPage])).toEqual([
      [1, 16],
      [17, 20],
    ]);
    expect(computeSignatureRanges(10, 6)).toHaveLength(3);
  });
});

describe("planImposition", () => {
  it("counts sheets per signature, not per run", () => {
    const plan = planImposition(10, "signature", 8);
    expect(plan.signatureSheetCounts).toEqual({ 1: 2, 2: 1 });
    expect(plan.sheets.map((s) => s.signature)).toEqual([1, 1, 2]);
    // Index restarts inside each signature, which is what creep needs.
    expect(plan.sheets.map((s) => s.index)).toEqual([0, 1, 0]);
  });

  it("every real page appears exactly once, for every binding and length", () => {
    for (let count = 1; count <= 40; count++) {
      for (const binding of BINDINGS) {
        const plan = planImposition(count, binding, 8);
        const real = allSides(plan.sheets).filter((n): n is number => n !== null && n <= count);
        expect(new Set(real).size, `${binding}/${count}: duplicate page`).toBe(count);
        expect(real.sort((a, b) => a - b), `${binding}/${count}: missing page`).toEqual(
          Array.from({ length: count }, (_, i) => i + 1)
        );
      }
    }
  });

  it("never emits a page number outside the padded total", () => {
    for (let count = 1; count <= 30; count++) {
      for (const binding of BINDINGS) {
        const plan = planImposition(count, binding, 8);
        for (const n of allSides(plan.sheets)) {
          if (n === null) continue;
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(plan.paddedTotal);
        }
      }
    }
  });

  it("pads every binding to a multiple of 4 pages", () => {
    for (const binding of BINDINGS) {
      expect(planImposition(10, binding, 4).paddedTotal % 4, binding).toBe(0);
    }
    expect(pagesOf(0)).toHaveLength(0);
  });
});

describe("computeCreepShiftMm", () => {
  it("shifts the outermost sheet most and the innermost not at all", () => {
    expect(computeCreepShiftMm(1, 4, 0.1)).toBeCloseTo(0.6, 10);
    expect(computeCreepShiftMm(4, 4, 0.1)).toBe(0);
  });

  it("is scoped to a single signature", () => {
    // Regression: the run used to pass the total sheet count of *all*
    // signatures here, tripling the shift for a 2-signature book.
    const perSignature = computeCreepShiftMm(1, 2, 0.1);
    const globally = computeCreepShiftMm(1, 4, 0.1);
    expect(perSignature).toBeCloseTo(0.2, 10);
    expect(perSignature).toBeLessThan(globally);
  });

  it("scales a manual shift linearly and never goes negative", () => {
    // The outermost sheet takes the full manual amount, the innermost none.
    expect(computeCreepShiftMm(1, 3, 0.1, "manual", 1.5)).toBeCloseTo(1.5, 10);
    expect(computeCreepShiftMm(2, 3, 0.1, "manual", 1.5)).toBeCloseTo(0.75, 10);
    expect(computeCreepShiftMm(3, 3, 0.1, "manual", 1.5)).toBe(0);
    expect(computeCreepShiftMm(1, 1, 0.1, "manual", 5)).toBe(0);
    expect(computeCreepShiftMm(1, 2, -3)).toBe(0);
  });
});
