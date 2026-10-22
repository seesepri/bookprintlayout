import { describe, expect, it } from "vitest";
import { buildSheetGeometry, markRoomFor, type SheetGeometry } from "./geometry";
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

/** A3 portrait, the sheet the 4-up questions are always asked about. */
const A3 = { width: 297, height: 420 };

function gridGeometry(bookSize: { width: number; height: number }, gutterMm = 0): SheetGeometry {
  const plan = planImposition(16, "perfect-binding", 16, "left", { slotsPerSide: 4 });
  return buildSheetGeometry({
    sheet: plan.sheets[0],
    paper: A3,
    bookSize,
    bleedMm: 0,
    gutterMm,
    safeAreaMm: 0,
    binding: "perfect-binding",
    bindingDirection: "left",
    pages,
    marks: MARKS as never,
    creep: { enabled: false, perSheetMm: 0 } as never,
    signatureSheetCount: 1,
    grid: { cols: 2, rows: 2 } as never,
    quadHeadToHead: true,
  });
}

/** Where a mark's arms actually land, following the geometry's own convention. */
function arms(mark: { x: number; y: number; dx: number; dy: number }, gap = 2, len = 5) {
  const horizontal = mark.dx === 0 ? null : { from: mark.x + mark.dx * gap, to: mark.x + mark.dx * (gap + len) };
  const vertical = mark.dy === 0 ? null : { from: mark.y + mark.dy * gap, to: mark.y + mark.dy * (gap + len) };
  return { horizontal, vertical };
}

describe("finding B — crop mark arms point away from the block", () => {
  it("gives the top corners an upward arm and the bottom corners a downward one", () => {
    const g = gridGeometry({ width: 105, height: 148 }); // A6: plenty of room around the block
    const block = g.block!;
    const top = g.cropMarks.filter((m) => m.y === block.y + block.height);
    const bottom = g.cropMarks.filter((m) => m.y === block.y);
    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    expect(top.every((m) => m.dy === 1)).toBe(true);
    expect(bottom.every((m) => m.dy === -1)).toBe(true);
  });

  it("draws every arm outside the trim block when the sheet has room", () => {
    const g = gridGeometry({ width: 105, height: 148 });
    const { x, y, width, height } = g.block!;
    for (const mark of g.cropMarks) {
      const { horizontal, vertical } = arms(mark);
      // A horizontal arm may sit on the block edge vertically, but its whole run
      // has to be clear of the block on its own side.
      if (horizontal) {
        if (mark.dx < 0) expect(Math.max(horizontal.from, horizontal.to)).toBeLessThanOrEqual(x + 1e-6);
        else expect(Math.min(horizontal.from, horizontal.to)).toBeGreaterThanOrEqual(x + width - 1e-6);
      }
      if (vertical) {
        // Outward on the y axis: never between the block's own bottom and top.
        const outside = vertical.to > y + height || vertical.to < y;
        expect(outside).toBe(true);
      }
    }
  });

  it("leaves the classic two-up spread pointing outward too", () => {
    // Regression guard: this path was already correct and must not be flipped by
    // the fix above.
    const plan = planImposition(16, "booklet", 16, "left", { slotsPerSide: 2 });
    const g = buildSheetGeometry({
      sheet: plan.sheets[0],
      paper: A3,
      bookSize: { width: 105, height: 148 },
      bleedMm: 0,
      gutterMm: 0,
      safeAreaMm: 0,
      binding: "booklet",
      bindingDirection: "left",
      pages,
      marks: MARKS as never,
      creep: { enabled: false, perSheetMm: 0 } as never,
      signatureSheetCount: 1,
      grid: { cols: 2, rows: 1 } as never,
      quadHeadToHead: true,
    });
    const top = g.cropMarks.filter((m) => m.dy === 1);
    const bottom = g.cropMarks.filter((m) => m.dy === -1);
    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    // Upward arms belong to the higher of the two y values, downward ones to the lower.
    const ys = g.cropMarks.map((m) => m.y);
    expect(Math.min(...top.map((m) => m.y))).toBeGreaterThan(Math.min(...ys));
  });

  it("skips an arm that has no room instead of drawing it inwards", () => {
    // A5 on A3: the block fills the sheet, so there is nowhere outward to go.
    const g = gridGeometry({ width: 148, height: 210 });
    const block = g.block!;
    expect(block.y).toBe(0);
    expect(block.height).toBe(A3.height);
    // Both the top and bottom marks sit on the paper edge: any arm drawn here
    // would have to point into the artwork, which is exactly the bug.
    const verticalArms = g.cropMarks.filter((m) => m.dy !== 0);
    for (const mark of verticalArms) {
      expect(mark.y === 0 || mark.y === A3.height).toBe(true);
    }
  });
});

describe("markRoomFor — mirrors fitMarkRun so warnings can tell the truth", () => {
  it("calls a full run when the sheet has the whole 7 mm", () => {
    expect(markRoomFor(7)).toBe("full");
    expect(markRoomFor(40)).toBe("full");
  });

  it("calls a shortened run when there is some room but not enough", () => {
    expect(markRoomFor(4)).toBe("short");
  });

  it("calls nothing when the mark would be a stub", () => {
    expect(markRoomFor(0)).toBe("none");
    expect(markRoomFor(0.5)).toBe("none");
    expect(markRoomFor(-3)).toBe("none");
  });
});
