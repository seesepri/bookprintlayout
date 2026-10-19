import { describe, expect, it } from "vitest";
import { resolvePrintPlan } from "./plan";
import { resolveSheet } from "./previewHelpers";
import { planImposition } from "./imposition";

const A5 = { width: 148, height: 210 };
const A3 = { width: 297, height: 420 };
const SRA3 = { width: 320, height: 450 };

const base = {
  paperSize: A3,
  bookSize: A5,
  orientation: "portrait" as const,
  binding: "perfect-binding" as const,
  bleedMm: 0,
  gutterMm: 0,
  showCropMarks: true,
};

describe("resolvePrintPlan padding", () => {
  it("asks for eight-page multiples on a 4-up sheet, not four", () => {
    // The page browser used to hardcode `blankPagesNeeded(n, 4)` and tell a
    // 10-page book it was 2 blanks short, while the engine needed 6.
    const plan = resolvePrintPlan({ ...base, pageCount: 10, pagesPerSide: 4 });

    expect(plan.layout.slotsPerSide).toBe(4);
    expect(plan.pagesPerSheet).toBe(8);
    expect(plan.blanks).toBe(6);
    expect(plan.plan.paddedTotal).toBe(16);
  });

  it("agrees with the engine for every length, on every binding", () => {
    for (const binding of ["booklet", "saddle-stitch", "perfect-binding", "signature"] as const) {
      for (const pagesPerSide of ["auto", 2, 4] as const) {
        for (let n = 1; n <= 40; n++) {
          const plan = resolvePrintPlan({ ...base, binding, pageCount: n, pagesPerSide });
          const engine = planImposition(n, binding, 16, "left", { slotsPerSide: plan.layout.slotsPerSide });
          expect(plan.blanks, `${binding} / ${pagesPerSide} / ${n} halaman`).toBe(engine.paddedTotal - n);
          expect(plan.plan.paddedTotal).toBe(engine.paddedTotal);
        }
      }
    }
  });

  it("still pads a spread to a multiple of four", () => {
    const plan = resolvePrintPlan({ ...base, pageCount: 10, pagesPerSide: 2 });
    expect(plan.pagesPerSheet).toBe(4);
    expect(plan.blanks).toBe(2);
  });
});

describe("resolveSheet orientation", () => {
  it("picks the orientation that actually fits the denser grid", () => {
    // SRA3 is 320x450: portrait carries 2x2 A5, landscape does not. Deciding
    // orientation before the grid made `auto` land on the 2-up sheet.
    const auto = resolveSheet({ ...base, paper: SRA3, orientation: "auto", setting: "auto" });
    expect(auto.layout.slotsPerSide).toBe(4);
    expect(auto.paper).toEqual({ width: 320, height: 450 });
  });

  it("leaves a project alone when both orientations carry the same grid", () => {
    // 2-up is the only option here, so the historical auto choice must stand:
    // the spread is wide, so the paper stays landscape.
    const auto = resolveSheet({ ...base, paper: A3, orientation: "auto", setting: 2, binding: "booklet" });
    expect(auto.layout.slotsPerSide).toBe(2);
    expect(auto.paper).toEqual({ width: 420, height: 297 });
  });

  it("honours an orientation the user pinned", () => {
    const portrait = resolveSheet({ ...base, paper: SRA3, orientation: "portrait", setting: "auto" });
    const landscape = resolveSheet({ ...base, paper: SRA3, orientation: "landscape", setting: "auto" });
    expect(portrait.paper).toEqual({ width: 320, height: 450 });
    expect(portrait.layout.slotsPerSide).toBe(4);
    expect(landscape.paper).toEqual({ width: 450, height: 320 });
    expect(landscape.layout.slotsPerSide).toBe(2);
  });
});
