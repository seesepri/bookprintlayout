import { describe, expect, it } from "vitest";
import { pruneToVisible } from "./previewHelpers";

describe("pruneToVisible", () => {
  it("keeps only the pages still on screen", () => {
    const cache = { 1: "a", 2: "b", 3: "c", 9: "d" };
    expect(pruneToVisible(cache, [2, 3])).toEqual({ 2: "b", 3: "c" });
  });

  it("returns the very same object when nothing has to go", () => {
    // Same reference = the caller's setState is a no-op and React skips the render.
    const cache = { 4: "a", 5: "b" };
    expect(pruneToVisible(cache, [4, 5])).toBe(cache);
  });

  it("handles a view that shows nothing (blank sheet or no file yet)", () => {
    expect(pruneToVisible({ 1: "a" }, [])).toEqual({});
    const empty = {};
    expect(pruneToVisible(empty, [])).toBe(empty);
  });

  it("accepts a Set as the visible list", () => {
    expect(pruneToVisible({ 1: "a", 2: "b" }, new Set([1]))).toEqual({ 1: "a" });
  });
});
