interface RulerProps {
  lengthMm: number;
  scale: number; // px per mm
  orientation: "horizontal" | "vertical";
}

export default function Ruler({ lengthMm, scale, orientation }: RulerProps) {
  const ticks = [];
  const totalMm = Math.ceil(lengthMm / 10) * 10;
  for (let mm = 0; mm <= totalMm; mm += 5) {
    const isMajor = mm % 25 === 0;
    const pos = mm * scale;
    ticks.push(
      orientation === "horizontal" ? (
        <div
          key={mm}
          className="absolute top-0 border-l border-slate-400/70 dark:border-slate-600"
          style={{ left: pos, height: isMajor ? 10 : 5 }}
        >
          {isMajor && (
            <span className="absolute left-1 top-0.5 text-[9px] text-slate-500 dark:text-slate-400">{mm}</span>
          )}
        </div>
      ) : (
        <div
          key={mm}
          className="absolute left-0 border-t border-slate-400/70 dark:border-slate-600"
          style={{ top: pos, width: isMajor ? 10 : 5 }}
        >
          {isMajor && (
            <span
              className="absolute left-2.5 top-[-5px] text-[9px] text-slate-500 dark:text-slate-400"
              style={{ writingMode: "vertical-rl" }}
            >
              {mm}
            </span>
          )}
        </div>
      )
    );
  }

  return (
    <div
      className={
        orientation === "horizontal"
          ? "relative h-5 shrink-0 overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          : "relative w-5 shrink-0 overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }
      style={orientation === "horizontal" ? { width: totalMm * scale } : { height: totalMm * scale }}
    >
      {ticks}
    </div>
  );
}
