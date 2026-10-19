import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3x3,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Move,
  Expand,
} from "lucide-react";
import { useProject } from "../../state/ProjectContext";
import { planImposition } from "../../lib/imposition";
import { buildSheetGeometry, PagePlacement } from "../../lib/geometry";
import {
  orientedPaperSize,
  getPageThumb,
  resolveSheetLayout,
  hiResWidthFor,
  shouldRenderHiRes,
  thumbnailFormatFor,
} from "../../lib/previewHelpers";
import { getSharedRenderDoc, renderPageThumbnail } from "../../lib/pdfRender";
import Ruler from "./Ruler";
import { cn } from "../../utils/cn";

const BASE_PX_PER_MM = 2.6;

export default function PreviewCanvas() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const paper = useMemo(
    () => orientedPaperSize(activePaperSize, state.orientation, activeBookSize),
    [activePaperSize, state.orientation, activeBookSize]
  );

  // The same resolver the exporter runs, so the sheet on screen is the sheet on
  // paper — including when a 2x2 grid starts paying for itself.
  const layout = useMemo(
    () =>
      resolveSheetLayout({
        paper,
        bookSize: activeBookSize,
        binding: state.binding,
        setting: state.pagesPerSide,
        bleedMm: state.bleedMm,
        gutterMm: state.gutterMm,
        showCropMarks: state.marks.showCropMarks,
      }),
    [paper, activeBookSize, state.binding, state.pagesPerSide, state.bleedMm, state.gutterMm, state.marks.showCropMarks]
  );

  const plan = useMemo(
    () =>
      planImposition(state.pages.length || 0, state.binding, state.signatureSize, state.bindingDirection, {
        slotsPerSide: layout.slotsPerSide,
      }),
    [state.pages.length, state.binding, state.signatureSize, state.bindingDirection, layout.slotsPerSide]
  );

  const currentSheet = plan.sheets[Math.min(sheetIndex, Math.max(plan.sheets.length - 1, 0))];
  const signatureSheetCountOfSheet = currentSheet
    ? plan.signatureSheetCounts[currentSheet.signature] ?? 1
    : 1;

  const scale = BASE_PX_PER_MM * state.zoom;
  const sheetWpx = paper.width * scale;
  const sheetHpx = paper.height * scale;

  const isFolded = state.binding !== "perfect-binding";

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    const nextZoom = Math.min(3, Math.max(0.2, state.zoom + direction * 0.1));
    dispatch({ type: "SET_ZOOM", zoom: Number(nextZoom.toFixed(2)) });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPan({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
  };
  const onPointerUp = () => {
    dragging.current = null;
  };

  const fitToScreen = () => {
    setPan({ x: 0, y: 0 });
    const el = containerRef.current;
    if (!el) return;
    const availW = el.clientWidth - 80;
    const availH = el.clientHeight - 80;
    const targetW = paper.width * BASE_PX_PER_MM;
    const targetH = paper.height * BASE_PX_PER_MM;
    const z = Math.min(availW / targetW, availH / targetH, 2.5);
    dispatch({ type: "SET_ZOOM", zoom: Math.max(0.2, Number(z.toFixed(2))) });
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const geometry = useMemo(() => {
    if (!plan.sheets.length) return null;
    return buildSheetGeometry({
      sheet: plan.sheets[Math.min(sheetIndex, plan.sheets.length - 1)],
      paper,
      bookSize: activeBookSize,
      bleedMm: state.bleedMm,
      gutterMm: state.gutterMm,
      safeAreaMm: state.safeAreaMm,
      binding: state.binding,
      bindingDirection: state.bindingDirection,
      pages: state.pages,
      marks: state.marks,
      creep: state.creep,
      signatureSheetCount: signatureSheetCountOfSheet,
      grid: layout.grid,
      quadHeadToHead: state.quadHeadToHead,
    });
  }, [
    plan.sheets,
    sheetIndex,
    paper,
    activeBookSize,
    state.bleedMm,
    state.safeAreaMm,
    state.gutterMm,
    state.binding,
    state.bindingDirection,
    state.pages,
    state.marks,
    state.creep,
    signatureSheetCountOfSheet,
    layout.grid,
    state.quadHeadToHead,
  ]);

  const sidePlacements: PagePlacement[] = useMemo(() => {
    if (!geometry) return [];
    return side === "front"
      ? geometry.frontSlots ?? [geometry.front.left, geometry.front.right]
      : geometry.backSlots ?? [geometry.back.left, geometry.back.right];
  }, [geometry, side]);

  /**
   * Rework of the upload-time thumbnail for the sheet view only.
   *
   * Uploading rasterises one 220 px lossy image per page for the page browser.
   * Shown at ~1 mm = 2.6 px and DPR 2, a single page wants 500-800 px, so the
   * sheet was stretching that thumbnail. Pages currently visible get re-rendered
   * from the source document at the size they are actually drawn.
   */
  const [sharp, setSharp] = useState<Record<number, { url: string; width: number }>>({});
  const wantedSharpWidth = useMemo(
    () =>
      hiResWidthFor(
        sidePlacements.reduce((max, p) => Math.max(max, p.trim.width), 0),
        scale,
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
      ),
    [sidePlacements, scale]
  );
  const sharpTargets = useMemo(
    () =>
      sidePlacements
        .map((p) => p.pageNumber)
        .filter((n): n is number => !!n && shouldRenderHiRes(sharp[n]?.width, wantedSharpWidth)),
    // `sharp` is deliberately not a dependency: the effect below is what fills it.
    [sidePlacements, wantedSharpWidth]
  );

  // A new file means new bytes behind the same page numbers: drop the cache.
  useEffect(() => setSharp({}), [state.sourceBytes]);

  useEffect(() => {
    const bytes = state.sourceBytes;
    if (!bytes?.length || !sharpTargets.length || wantedSharpWidth <= 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const handle = await getSharedRenderDoc(bytes);
        const next: Record<number, { url: string; width: number }> = {};
        for (const pageNumber of sharpTargets) {
          // A page can be reordered or replaced in the page browser, so the
          // source page to rasterise is the one this page still points at.
          const sourcePage = (state.pages[pageNumber - 1]?.originalIndex ?? pageNumber - 1) + 1;
          const { dataUrl } = await renderPageThumbnail(handle, sourcePage, wantedSharpWidth, thumbnailFormatFor(wantedSharpWidth));
          next[pageNumber] = { url: dataUrl, width: wantedSharpWidth };
        }
        if (!cancelled) setSharp((prev) => ({ ...prev, ...next }));
      } catch {
        /* Unreadable source: the fast thumbnail stays, nothing else changes. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.sourceBytes, state.pages, sharpTargets, wantedSharpWidth]);

  const renderPlacement = (placement: PagePlacement) => {
    const info = getPageThumb(state.pages, placement.pageNumber);
    const artworkUrl = (placement.pageNumber ? sharp[placement.pageNumber]?.url : undefined) ?? info?.thumbnail;
    const x = placement.bleed.x * scale;
    const y = (paper.height - placement.bleed.y - placement.bleed.height) * scale;
    const width = placement.bleed.width * scale;
    const height = placement.bleed.height * scale;
    const trimLeft = (placement.trim.x - placement.bleed.x) * scale;
    const trimTop = (placement.bleed.y + placement.bleed.height - placement.trim.y - placement.trim.height) * scale;
    const rotatedW = placement.rotation === 90 || placement.rotation === 270 ? info?.heightPt ?? 0 : info?.widthPt ?? 0;
    const rotatedH = placement.rotation === 90 || placement.rotation === 270 ? info?.widthPt ?? 0 : info?.heightPt ?? 0;
    const sourceHasBleed = !!info && (rotatedW > placement.trim.width * 72 / 25.4 + 0.25 || rotatedH > placement.trim.height * 72 / 25.4 + 0.25);

    return (
      <div
        key={`${placement.pageNumber ?? "blank"}-${placement.trim.x}-${placement.trim.y}`}
        className="absolute overflow-visible"
        style={{ left: x, top: y, width, height }}
      >
        <div
          className="absolute border border-slate-300 bg-white dark:border-slate-700"
          style={{ left: trimLeft, top: trimTop, width: placement.trim.width * scale, height: placement.trim.height * scale }}
        >
          {artworkUrl ? (
            <div
              className="absolute overflow-hidden bg-white"
              style={{
                left: sourceHasBleed ? -trimLeft : 0,
                top: sourceHasBleed ? -trimTop : 0,
                width: sourceHasBleed ? width : placement.trim.width * scale,
                height: sourceHasBleed ? height : placement.trim.height * scale,
              }}
            >
              <img
                src={artworkUrl}
                alt={`page-${placement.pageNumber}`}
                className="h-full w-full object-contain"
                style={{ transform: `rotate(${placement.rotation}deg)` }}
                draggable={false}
              />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-300 dark:bg-slate-800">
              <span className="text-3xl font-black">{placement.pageNumber ?? "—"}</span>
              <span className="text-[10px] font-medium uppercase tracking-wider">{placement.pageNumber ? "Page" : "Blank"}</span>
            </div>
          )}
          {state.marks.showSafeArea && (
            <div
              className="pointer-events-none absolute border border-dashed border-sky-400"
              style={{
                left: (placement.safe.x - placement.trim.x) * scale,
                top: (placement.trim.y + placement.trim.height - placement.safe.y - placement.safe.height) * scale,
                width: placement.safe.width * scale,
                height: placement.safe.height * scale,
              }}
            />
          )}
          {placement.pageNumber && (
            <span className="absolute bottom-1 right-1.5 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {placement.pageNumber}
            </span>
          )}
        </div>
        {state.marks.showBleedArea && (
          <div className="pointer-events-none absolute inset-0 border border-dashed border-red-400/70" />
        )}
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="preview-toolbar flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2.5 py-2 sm:px-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(
            [
              { key: "spread", icon: BookOpenText, label: "Spread" },
              { key: "grid", icon: Grid3x3, label: "Grid" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => dispatch({ type: "SET_VIEW_MODE", mode: m.key })}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                state.viewMode === m.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <m.icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {state.viewMode !== "grid" && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-1 py-0.5 dark:border-slate-700">
            <button
              disabled={sheetIndex === 0}
              onClick={() => setSheetIndex((i) => Math.max(0, i - 1))}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[72px] sm:min-w-[92px] text-center text-xs font-medium text-slate-600 dark:text-slate-300">
              Sheet {plan.sheets.length ? sheetIndex + 1 : 0} / {plan.sheets.length}
            </span>
            <button
              disabled={sheetIndex >= plan.sheets.length - 1}
              onClick={() => setSheetIndex((i) => Math.min(plan.sheets.length - 1, i + 1))}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {isFolded && (
              <div className="ml-1 flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setSide("front")}
                  className={cn(
                    "px-2 py-1 text-[11px] font-semibold",
                    side === "front" ? "bg-slate-900 text-white" : "text-slate-500"
                  )}
                >
                  Front
                </button>
                <button
                  onClick={() => setSide("back")}
                  className={cn(
                    "px-2 py-1 text-[11px] font-semibold",
                    side === "back" ? "bg-slate-900 text-white" : "text-slate-500"
                  )}
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => dispatch({ type: "SET_ZOOM", zoom: Math.max(0.2, Number((state.zoom - 0.15).toFixed(2))) })}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
            {Math.round(state.zoom * 100)}%
          </span>
          <button
            onClick={() => dispatch({ type: "SET_ZOOM", zoom: Math.min(4, Number((state.zoom + 0.15).toFixed(2))) })}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={fitToScreen}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Maximize2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Fit</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Expand className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Fullscreen</span>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-100 dark:bg-slate-950">
        {!state.pages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <BookOpenText className="h-10 w-10" />
            <p className="text-sm font-medium">Upload PDF untuk melihat preview layout</p>
          </div>
        ) : state.viewMode === "grid" ? (
          <div className="h-full overflow-auto p-6">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {plan.sheets.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSheetIndex(idx);
                    dispatch({ type: "SET_VIEW_MODE", mode: "spread" });
                  }}
                  className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>Sheet {idx + 1}</span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600 group-hover:bg-indigo-100 dark:bg-indigo-900/40">
                      Sig {s.signature}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[s.front.left, s.front.right].map((n, i) => (
                      <div
                        key={i}
                        className="flex aspect-[3/4] flex-1 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                      >
                        {getPageThumb(state.pages, n)?.thumbnail ? (
                          <img src={getPageThumb(state.pages, n)!.thumbnail} alt={`Halaman ${n}`} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs font-bold text-slate-300">{n ?? "-"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 text-center text-[10px] text-slate-400">
                    Front: {s.front.left ?? "–"} | {s.front.right ?? "–"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full">
            <div className="flex w-5 shrink-0 flex-col">
              <div className="h-5 shrink-0 border-b border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              <div className="flex-1 overflow-hidden">
                <div style={{ transform: `translateY(${pan.y}px)` }}>
                  <Ruler lengthMm={paper.height} scale={scale} orientation="vertical" />
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="overflow-hidden">
                <div style={{ transform: `translateX(${pan.x}px)` }}>
                  <Ruler lengthMm={paper.width} scale={scale} orientation="horizontal" />
                </div>
              </div>
              <div
                className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)",
                  backgroundSize: `${scale * 10}px ${scale * 10}px`,
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{ transform: `translate(-50%,-50%) translate(${pan.x}px, ${pan.y}px)` }}
                >
                  <div
                    className="relative bg-white shadow-2xl ring-1 ring-slate-300 dark:ring-slate-700"
                    style={{ width: sheetWpx, height: sheetHpx }}
                  >
                    {geometry && sidePlacements.length > 0 && <>{sidePlacements.map(renderPlacement)}</>}
                    {state.marks.showFoldMarks && isFolded && geometry && (
                      <div
                        className="pointer-events-none absolute top-0 z-10 h-full border-l border-dashed border-violet-400"
                        style={{ left: geometry.foldX * scale }}
                      />
                    )}
                    {state.marks.showRegistrationMarks && (
                      <>
                        {[
                          { x: 5, y: 5 },
                          { x: paper.width - 5, y: 5 },
                          { x: 5, y: paper.height - 5 },
                          { x: paper.width - 5, y: paper.height - 5 },
                        ].map((c, i) => (
                          <div key={i} className="pointer-events-none absolute" style={{ left: c.x * scale, top: c.y * scale }}>
                            <div className="absolute h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-slate-700" />
                            <div className="absolute h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-slate-700" />
                            <div className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-700" />
                          </div>
                        ))}
                      </>
                    )}
                    {state.marks.showCenterLine && (
                      <div className="pointer-events-none absolute left-1/2 top-0 h-full border-l border-dashed border-slate-700" />
                    )}
                    {state.marks.showCropMarks &&
                      geometry?.cutLines?.map((y, i) => (
                        <div
                          key={`cut-${i}`}
                          className="pointer-events-none absolute left-0 z-10 w-full border-t border-dashed border-amber-500"
                          style={{ top: (paper.height - y) * scale }}
                        />
                      ))}
                    {state.marks.showCropMarks && geometry && (
                      <>
                        {geometry.cropMarks.map((mark, i) => {
                          const x = mark.x * scale;
                          const y = (paper.height - mark.y) * scale;
                          const gap = geometry.cropGapMm * scale;
                          const length = geometry.cropLengthMm * scale;
                          return (
                            <div key={i} className="pointer-events-none absolute" style={{ left: x, top: y }}>
                              <div
                                className="absolute h-px bg-slate-700"
                                style={{ left: mark.dx > 0 ? gap : -(gap + length), top: 0, width: length }}
                              />
                              <div
                                className="absolute w-px bg-slate-700"
                                style={{ left: 0, top: mark.dy > 0 ? -(gap + length) : gap, height: length }}
                              />
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
                <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow dark:bg-slate-900/90">
                  <Move className="h-3 w-3" /> Drag untuk menggeser canvas
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
