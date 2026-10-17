import { memo, useMemo } from "react";

interface RulerProps {
  lengthMm: number;
  scale: number; // px per mm
  orientation: "horizontal" | "vertical";
}

/**
 * Tick and label density follow the zoom level. A fixed 5 mm step turned the
 * ruler into ~150 absolutely positioned divs per axis at 100% and ~1500 when
 * zoomed in, and at low zoom the labels printed on top of each other.
 */
const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100];
const LABEL_STEPS = [10, 20, 50, 100, 200, 500];

function pickStep(steps: number[], scale: number, minPx: number): number {
  return steps.find((step) => step * scale >= minPx) ?? steps[steps.length - 1];
}

function Ruler({ lengthMm, scale, orientation }: RulerProps) {
  const horizontal = orientation === "horizontal";
  const totalMm = Math.ceil(lengthMm / 10) * 10;
  const tickStep = pickStep(TICK_STEPS, scale, 6);
  const labelStep = pickStep(LABEL_STEPS, scale, 46);

  const ticks = useMemo(() => {
    const nodes: React.ReactElement[] = [];
    for (let mm = 0; mm <= totalMm; mm += tickStep) {
      const labelled = mm % labelStep === 0;
      const pos = mm * scale;
      const height = labelled ? 10 : mm % (tickStep * 2) === 0 ? 7 : 4;
      nodes.push(
        horizontal ? (
          <div
            key={mm}
            className="absolute top-0 border-l border-slate-400/70 dark:border-slate-600"
            style={{ left: pos, height }}
          >
            {labelled && (
              <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-slate-500 dark:text-slate-400">
                {mm}
              </span>
            )}
          </div>
        ) : (
          <div
            key={mm}
            className="absolute left-0 border-t border-slate-400/70 dark:border-slate-600"
            style={{ top: pos, width: height }}
          >
            {labelled && (
              <span
                className="absolute left-2.5 top-[-5px] text-[9px] tabular-nums text-slate-500 dark:text-slate-400"
                style={{ writingMode: "vertical-rl" }}
              >
                {mm}
              </span>
            )}
          </div>
        )
      );
    }
    return nodes;
  }, [totalMm, tickStep, labelStep, scale, horizontal]);

  return (
    <div
      className={
        horizontal
          ? "relative h-5 shrink-0 overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          : "relative w-5 shrink-0 overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }
      style={horizontal ? { width: totalMm * scale } : { height: totalMm * scale }}
    >
      {ticks}
    </div>
  );
}

/**
 * Pure function of three props, and the most expensive subtree in the preview:
 * the parent re-renders on every pan/zoom frame, so this is memoised to keep
 * the ruler out of that cost unless its own inputs change.
 */
export default memo(Ruler);
