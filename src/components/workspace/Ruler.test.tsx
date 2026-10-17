// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Ruler from "./Ruler";

function measure(scale: number, lengthMm = 100) {
  const { container } = render(<Ruler lengthMm={lengthMm} scale={scale} orientation="horizontal" />);
  const root = container.firstElementChild as HTMLElement;
  const ticks = [...root.querySelectorAll<HTMLElement>(":scope > div")];
  const labels = ticks
    .map((tick) => ({ left: parseFloat(tick.style.left), text: tick.textContent ?? "" }))
    .filter((tick) => tick.text !== "");
  return { ticks: ticks.length, labels };
}

describe("Ruler", () => {
  it("thins out ticks when zoomed way out", () => {
    const zoomedOut = measure(0.5);
    const zoomedIn = measure(40);
    expect(zoomedOut.ticks).toBeLessThan(10);
    expect(zoomedIn.ticks).toBeGreaterThan(50);
  });

  it("never packs labels closer than they can be read", () => {
    for (const scale of [0.5, 1.5, 3, 8, 40]) {
      const { labels } = measure(scale);
      const gaps = labels.slice(1).map((label, i) => label.left - labels[i].left);
      const tightest = Math.min(...gaps);
      expect(tightest, `scale ${scale} mm/px`).toBeGreaterThanOrEqual(46);
    }
  });

  it("starts at zero and covers the full length", () => {
    const { labels } = measure(8, 150);
    expect(labels[0].text).toBe("0");
    expect(labels[labels.length - 1].left).toBeGreaterThanOrEqual(150 * 8 - 1);
  });
});
