import { describe, expect, it } from "vitest";
import {
  PAIR_GRID,
  QUAD_GRID,
  chooseGrid,
  gridFits,
  gridSheetSize,
  isFoldedBinding,
  maxRowsThatFit,
  normalizePagesPerSide,
  slotCount,
  slotIndexFromPosition,
} from "./nup";

const A5 = { width: 148, height: 210 };
const A3_PORTRAIT = { width: 297, height: 420 };
const A4 = { width: 210, height: 297 };

describe("slotCount / isFoldedBinding", () => {
  it("counts the grid", () => {
    expect(slotCount(PAIR_GRID)).toBe(2);
    expect(slotCount(QUAD_GRID)).toBe(4);
  });

  it("treats only perfect binding as unfoldable", () => {
    expect(isFoldedBinding("perfect-binding")).toBe(false);
    for (const b of ["booklet", "saddle-stitch", "signature"] as const) {
      expect(isFoldedBinding(b)).toBe(true);
    }
  });
});

describe("gridSheetSize", () => {
  it("sizes a 2x1 spread exactly like the pair layout does", () => {
    const need = gridSheetSize(A5, PAIR_GRID, { bleedMm: 3, gutterMm: 6, marksRoomMm: 7 });
    expect(need.width).toBeCloseTo(148 * 2 + 6 + 6 + 14, 6);
    expect(need.height).toBeCloseTo(210 + 6 + 14, 6);
  });

  it("stacks rows without adding a gutter between them", () => {
    const need = gridSheetSize(A5, QUAD_GRID, { bleedMm: 0, gutterMm: 10, marksRoomMm: 0 });
    expect(need.width).toBeCloseTo(148 * 2 + 10, 6);
    expect(need.height).toBeCloseTo(210 * 2, 6);
  });

  it("fits four A5 pages on A3 portrait with no bleed", () => {
    expect(gridFits(A3_PORTRAIT, A5, QUAD_GRID, { bleedMm: 0, gutterMm: 0, marksRoomMm: 0 })).toBe(true);
  });

  it("declines the quad grid once bleed needs room the sheet does not have", () => {
    // 2 x 148 + 2 x 3 mm bleed = 302 mm > 297 mm.
    expect(gridFits(A3_PORTRAIT, A5, QUAD_GRID, { bleedMm: 3, gutterMm: 0, marksRoomMm: 0 })).toBe(false);
  });
});

describe("chooseGrid", () => {
  const room = { bleedMm: 0, gutterMm: 0, marksRoomMm: 0 };

  it("densifies A3 + A5 perfect binding to 4-up", () => {
    const choice = chooseGrid(A3_PORTRAIT, A5, "perfect-binding", "auto", room);
    expect(choice.grid).toEqual(QUAD_GRID);
    expect(choice.slotsPerSide).toBe(4);
    expect(choice.reason).toBe("quad");
  });

  it("leaves a sheet that only holds a spread alone", () => {
    const choice = chooseGrid(A4, A5, "perfect-binding", "auto", room);
    expect(choice.slotsPerSide).toBe(2);
    expect(choice.reason).toBe("pair-fits-only");
    expect(choice.quadAvailable).toBe(false);
  });

  it("never re-orders a folded binding, even when four pages would fit", () => {
    for (const binding of ["booklet", "saddle-stitch", "signature"] as const) {
      const choice = chooseGrid(A3_PORTRAIT, A5, binding, "auto", room);
      expect(choice.grid, binding).toEqual(PAIR_GRID);
      expect(choice.reason, binding).toBe("pair-folded");
    }
  });

  it("keeps an explicit 2-up request even when 4-up is possible", () => {
    expect(chooseGrid(A3_PORTRAIT, A5, "perfect-binding", 2, room).slotsPerSide).toBe(2);
    expect(chooseGrid(A3_PORTRAIT, A5, "perfect-binding", 2, room).reason).toBe("pair-forced");
  });

  it("falls back instead of overflowing when 4-up is forced but does not fit", () => {
    const choice = chooseGrid(A4, A5, "perfect-binding", 4, room);
    expect(choice.slotsPerSide).toBe(2);
    expect(choice.reason).toBe("pair-fits-only");
  });

  it("reports that a 4-up was available when the user forced it off", () => {
    expect(chooseGrid(A3_PORTRAIT, A5, "perfect-binding", 2, room).quadAvailable).toBe(true);
  });

  it("takes the 4-up when the marks are left with no room, and flags it", () => {
    // 2x2 A5 measures 296 x 420 mm on a 297 x 420 mm sheet: 7 mm of mark room on
    // every side is impossible, but the pages fit and the guillotine has the page
    // edges to cut on, so the layout is accepted and the marks are skipped.
    const choice = chooseGrid(A3_PORTRAIT, A5, "perfect-binding", "auto", { bleedMm: 0, gutterMm: 0, marksRoomMm: 7 });
    expect(choice.grid).toEqual(QUAD_GRID);
    expect(choice.quadAvailable).toBe(true);
    expect(choice.marksClipped).toBe(true);
  });

  it("keeps the marks when the sheet holds block, bleed and reserve", () => {
    const SRA3 = { width: 320, height: 450 };
    const choice = chooseGrid(SRA3, A5, "perfect-binding", "auto", { bleedMm: 3, gutterMm: 0, marksRoomMm: 7 });
    expect(choice.grid).toEqual(QUAD_GRID);
    expect(choice.marksClipped).toBe(false);
  });

  it("claims nothing about clipped marks for a spread", () => {
    const choice = chooseGrid(A4, A5, "perfect-binding", "auto", { bleedMm: 0, gutterMm: 0, marksRoomMm: 7 });
    expect(choice.grid).toEqual(PAIR_GRID);
    expect(choice.marksClipped).toBe(false);
  });

  it("still declines 4-up when bleed alone overflows, marks or not", () => {
    for (const marksRoomMm of [0, 7]) {
      const choice = chooseGrid(A3_PORTRAIT, A5, "perfect-binding", "auto", { bleedMm: 3, gutterMm: 0, marksRoomMm });
      expect(choice.grid, String(marksRoomMm)).toEqual(PAIR_GRID);
    }
  });
});

describe("maxRowsThatFit", () => {
  it("answers in whole rows only", () => {
    expect(maxRowsThatFit(A3_PORTRAIT, A5, room())).toBe(2);
    expect(maxRowsThatFit(A4, A5, room())).toBe(1);
    expect(maxRowsThatFit({ width: 100, height: 50 }, A5, room())).toBe(1);
  });

  function room() {
    return { bleedMm: 0, gutterMm: 0, marksRoomMm: 0 };
  }
});

describe("slotIndexFromPosition", () => {
  it("walks row-major", () => {
    expect([0, 1, 2, 3].map((i) => slotIndexFromPosition(QUAD_GRID, i))).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]);
  });
});

describe("normalizePagesPerSide", () => {
  it("accepts the numbers the type allows", () => {
    expect([4, 2, "auto"].map(normalizePagesPerSide)).toEqual([4, 2, "auto"]);
  });

  it("accepts the strings a <select> actually emits", () => {
    // The bug this exists for: the dropdown showed "4 per side" while the sheet
    // stayed 2-up, because `"4" === 4` is false.
    expect(normalizePagesPerSide("4")).toBe(4);
    expect(normalizePagesPerSide("2")).toBe(2);
  });

  it("falls back to auto for anything else", () => {
    expect([undefined, null, "", "quad", 0, 3].map(normalizePagesPerSide)).toEqual([
      "auto",
      "auto",
      "auto",
      "auto",
      "auto",
      2,
    ]);
  });
});

describe("chooseGrid with the raw value a <select> hands over", () => {
  const room = { bleedMm: 0, gutterMm: 0, marksRoomMm: 0 };

  it("still densifies a folded booklet to 2x2 head-to-head", () => {
    const choice = chooseGrid({ width: 324, height: 484 }, A5, "booklet", "4" as unknown as 4, room);
    expect(choice.grid).toEqual(QUAD_GRID);
    expect(choice.slotsPerSide).toBe(4);
    expect(choice.reason).toBe("quad-forced");
    expect(choice.headToHead).toBe(true);
  });

  it("still honours an explicit 2 on a glued book", () => {
    const choice = chooseGrid(A3_PORTRAIT, A5, "perfect-binding", "2" as unknown as 2, room);
    expect(choice.grid).toEqual(PAIR_GRID);
    expect(choice.reason).toBe("pair-forced");
  });
});
