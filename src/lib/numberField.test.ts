import { describe, expect, it } from "vitest";
import { commitDraftNumber, isDraftAccepted } from "./numberField";

describe("commitDraftNumber", () => {
  const box = { min: 20, max: 2000, step: 0.1, current: 148 };

  it("lets a short digit stay short while typing (the 210 bug)", () => {
    expect(commitDraftNumber("2", { ...box, live: true })).toBeNull();
    expect(commitDraftNumber("21", { ...box, live: true })).toBe(21);
    expect(commitDraftNumber("210", { ...box, live: true })).toBe(210);
  });

  it("does not renumber the field under the user's cursor", () => {
    // Old behaviour: "2" -> clamped to min 20 -> the next digit produced "201".
    expect(commitDraftNumber("5", { ...box, live: true })).toBeNull();
    expect(commitDraftNumber("50", { ...box, live: true })).toBe(50);
  });

  it("clamps only when the field is left", () => {
    expect(commitDraftNumber("5", { ...box, live: false })).toBe(20);
    expect(commitDraftNumber("9999", { ...box, live: false })).toBe(2000);
  });

  it("restores the previous value when the field is cleared or garbage", () => {
    expect(commitDraftNumber("", { ...box, live: false })).toBe(148);
    expect(commitDraftNumber("", { ...box, live: true })).toBeNull();
    expect(commitDraftNumber("abc", { ...box, live: false })).toBeNull();
  });

  it("honours a step, and skips rounding when none is given", () => {
    expect(commitDraftNumber("123.456", { min: 0, max: 1000, step: 0.1, current: 0, live: true })).toBe(123.5);
    expect(commitDraftNumber("0.075", { min: 0, max: 1, step: 0.01, current: 0, live: true })).toBe(0.08);
    expect(commitDraftNumber("0.075", { min: 0, max: 1, current: 0, live: true })).toBe(0.075);
  });

  it("keeps integers below a min blocked live but clamped on commit", () => {
    const sig = { min: 4, max: 200, current: 16 };
    expect(commitDraftNumber("1", { ...sig, live: true })).toBeNull();
    expect(commitDraftNumber("16", { ...sig, live: true })).toBe(16);
    expect(commitDraftNumber("2", { ...sig, live: false })).toBe(4);
  });
});

describe("isDraftAccepted", () => {
  it("reports in-range drafts only", () => {
    expect(isDraftAccepted("210", { min: 20, max: 2000 })).toBe(true);
    expect(isDraftAccepted("2", { min: 20, max: 2000 })).toBe(false);
    expect(isDraftAccepted("", { min: 20, max: 2000 })).toBe(false);
    expect(isDraftAccepted("nan", { min: 20, max: 2000 })).toBe(false);
  });
});
