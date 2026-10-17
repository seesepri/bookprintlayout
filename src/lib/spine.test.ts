import { describe, expect, it } from "vitest";
import { estimateSpineWidthMm, leavesFor } from "./spine";

describe("leavesFor", () => {
  it("counts a half sheet as a physical leaf", () => {
    expect(leavesFor(100)).toBe(50);
    expect(leavesFor(101)).toBe(51);
    expect(leavesFor(1)).toBe(1);
  });

  it("is zero for nothing or nonsense", () => {
    expect(leavesFor(0)).toBe(0);
    expect(leavesFor(-8)).toBe(0);
    expect(leavesFor(Number.NaN)).toBe(0);
  });
});

describe("estimateSpineWidthMm", () => {
  it("is leaf count times caliper", () => {
    expect(estimateSpineWidthMm({ pageCount: 100, paperThicknessMm: 0.1 })).toBe(5);
    expect(estimateSpineWidthMm({ pageCount: 320, paperThicknessMm: 0.09 })).toBe(14.4);
  });

  it("applies the gluing compression factor", () => {
    expect(estimateSpineWidthMm({ pageCount: 100, paperThicknessMm: 0.1, compress: 0.9 })).toBe(4.5);
  });

  it("rounds to the 0.1 mm a printer spread is quoted in", () => {
    expect(estimateSpineWidthMm({ pageCount: 33, paperThicknessMm: 0.075 })).toBe(1.3);
  });

  it("never invents a spine out of bad input", () => {
    expect(estimateSpineWidthMm({ pageCount: 100, paperThicknessMm: 0 })).toBe(0);
    expect(estimateSpineWidthMm({ pageCount: 100, paperThicknessMm: Number.NaN })).toBe(0);
    expect(estimateSpineWidthMm({ pageCount: 0, paperThicknessMm: 0.1 })).toBe(0);
  });

  it("clamps an absurd compression factor instead of exploding", () => {
    expect(estimateSpineWidthMm({ pageCount: 100, paperThicknessMm: 0.1, compress: 5 })).toBe(5);
    expect(estimateSpineWidthMm({ pageCount: 100, paperThicknessMm: 0.1, compress: -1 })).toBe(2.5);
  });
});
