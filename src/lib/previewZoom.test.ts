import { describe, expect, it } from "vitest";
import { clampZoom, zoomFromWheel, zoomStep, ZOOM_MAX, ZOOM_MIN } from "./previewHelpers";

describe("clampZoom", () => {
  it("keeps a zoom inside the shared range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.35)).toBe(0.35);
  });

  it("clamps to the same limits for every caller", () => {
    // The bug this replaces: the wheel stopped at 3, the +/- buttons reached 4.
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(-3)).toBe(ZOOM_MIN);
  });

  it("rounds away floating point drift so the toolbar never shows 34.999%", () => {
    expect(clampZoom(0.1 + 0.2)).toBe(0.3);
    expect(clampZoom(1.23456)).toBe(1.23);
    // Not 1.01: 1.005 is stored as 1.00499..., so two decimals round down.
    expect(clampZoom(1.005)).toBe(1);
  });

  it("falls back to 100% on a non-finite input instead of producing NaN px sizes", () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("steps by the button amount in both directions", () => {
    expect(zoomStep(1, 1)).toBe(1.15);
    expect(zoomStep(1, -1)).toBe(0.85);
  });

  it("stops at the limits instead of running past them", () => {
    expect(zoomStep(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(zoomStep(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe("zoomFromWheel", () => {
  it("zooms in when the wheel goes up and out when it goes down", () => {
    expect(zoomFromWheel(1, -100)).toBe(1.1);
    expect(zoomFromWheel(1, 100)).toBe(0.9);
  });

  it("compounds: three notches from 100% land on 130%, not 110%", () => {
    // The old handler read `state.zoom` from its closure, so a burst of wheel
    // events all computed from the same base and only one step survived.
    let zoom = 1;
    for (let i = 0; i < 3; i++) zoom = zoomFromWheel(zoom, -100);
    expect(zoom).toBe(1.3);
  });

  it("never leaves the range even when scrolled hard", () => {
    expect(zoomFromWheel(ZOOM_MAX, -100)).toBe(ZOOM_MAX);
    expect(zoomFromWheel(ZOOM_MIN, 100)).toBe(ZOOM_MIN);
  });
});
