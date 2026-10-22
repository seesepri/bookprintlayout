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
  getPageThumb,
  resolveSheet,
  hiResWidthFor,
  shouldRenderHiRes,
  thumbnailFormatFor,
  pruneToVisible,
  clampZoom,
  ZOOM_MIN,
  ZOOM_MAX,
} from "../../lib/previewHelpers";
import { getSharedRenderDoc, renderPageThumbnail } from "../../lib/pdfRender";
import Ruler from "./Ruler";
import { cn } from "../../utils/cn";

const BASE_PX_PER_MM = 2.6;

/**
 * `devicePixelRatio` as state, so a window dragged to a monitor with a different
 * density re-renders instead of keeping the old snapping until something else
 * happens to move. `matchMedia` on the *current* ratio is the only reliable way
 * to hear about the change; it is re-armed after every fire because the query
 * string itself is what encodes the old value.
 */
function useDevicePixelRatio(): number {
  const read = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(read);
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(read());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [dpr]);
  return dpr;
}

export default function PreviewCanvas() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const containerRef = useRef<HTMLDivElement>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // The same resolver the exporter runs, so the sheet on screen is the sheet on
  // paper — orientation and grid together, which is the only way `auto` can show
  // the 4-up sheet that the other orientation would have hidden.
  const { paper, layout } = useMemo(
    () =>
      resolveSheet({
        paper: activePaperSize,
        orientation: state.orientation,
        bookSize: activeBookSize,
        binding: state.binding,
        setting: state.pagesPerSide,
        bleedMm: state.bleedMm,
        gutterMm: state.gutterMm,
        showCropMarks: state.marks.showCropMarks,
      }),
    [
      activePaperSize,
      state.orientation,
      activeBookSize,
      state.binding,
      state.pagesPerSide,
      state.bleedMm,
      state.gutterMm,
      state.marks.showCropMarks,
    ]
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
  /**
   * Snap every box to whole device pixels. At a fractional size the browser
   * resamples the page raster even when the raster is exactly 1:1, and that
   * resampling is what reads as "blurry" on an otherwise sharp render.
   */
  const dpr = useDevicePixelRatio();
  const snap = (px: number) => Math.round(px * dpr) / dpr;
  const sheetWpx = snap(paper.width * scale);
  const sheetHpx = snap(paper.height * scale);

  const isFolded = state.binding !== "perfect-binding";

  /**
   * Wheel zoom needs a *non-passive* listener.
   *
   * React attaches `wheel` passively at the root, so `preventDefault()` inside an
   * `onWheel` prop is ignored and logs "Unable to preventDefault inside passive
   * event listener" — the zoom changed, but the page behind it scrolled too.
   * The only way to actually cancel the scroll is a native listener registered
   * with `{ passive: false }`.
   */
  const dragAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dragAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Relative action: the reducer owns the arithmetic, so a burst of wheel
      // events compounds instead of every event starting from the stale closure.
      dispatch({ type: "NUDGE_ZOOM", direction: e.deltaY > 0 ? -1 : 1, step: 0.1 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [state.pages.length, state.viewMode]);

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
    const z = Math.min(availW / targetW, availH / targetH);
    dispatch({ type: "SET_ZOOM", zoom: clampZoom(z) });
  };

  /**
   * Fullscreen can legitimately fail — a browser policy, or a page inside an
   * iframe that was not granted the permission. `requestFullscreen` returns a
   * promise, and leaving it unhandled threw an unhandled rejection into the
   * console for a button press the user could not do anything about.
   */
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {
      /* Denied by policy: stay in the normal view, nothing else to undo. */
    }
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
    [sidePlacements, scale, dpr]
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

  /**
   * Keep the cache to what is on screen.
   *
   * Every page viewed used to keep its raster forever, so paging through a long
   * book accumulated one data URL per page — a few hundred of them on a 400-page
   * document. Re-rendering a page on the way back costs one raster; holding every
   * page costs memory for the whole session.
   */
  useEffect(() => {
    const visible = sidePlacements.map((p) => p.pageNumber).filter((n): n is number => n !== null);
    setSharp((prev) => pruneToVisible(prev, visible));
  }, [sidePlacements]);

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
    const x = snap(placement.bleed.x * scale);
    const y = snap((paper.height - placement.bleed.y - placement.bleed.height) * scale);
    const width = snap(placement.bleed.width * scale);
    const height = snap(placement.bleed.height * scale);
    const trimLeft = snap((placement.trim.x - placement.bleed.x) * scale);
    const trimTop = snap((placement.bleed.y + placement.bleed.height - placement.trim.y - placement.trim.height) * scale);
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
          className="absolute border border-slate-300 bg-white"
          style={{ left: trimLeft, top: trimTop, width: snap(placement.trim.width * scale), height: snap(placement.trim.height * scale) }}
        >
          {artworkUrl ? (
            <div
              className="absolute overflow-hidden bg-white"
              style={{
                left: sourceHasBleed ? -trimLeft : 0,
                top: sourceHasBleed ? -trimTop : 0,
                width: sourceHasBleed ? width : snap(placement.trim.width * scale),
                height: sourceHasBleed ? height : snap(placement.trim.height * scale),
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
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-300">
              <span className="text-3xl font-black">{placement.pageNumber ?? "—"}</span>
              <span className="text-[10px] font-medium uppercase tracking-wider">{placement.pageNumber ? "Halaman" : "Kosong"}</span>
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
            <span className="absolute bottom-1 right-1.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
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
    <div className="flex min-w-0 flex-1 flex-col bg-slate-100">
      {/* Toolbar */}
      <div className="preview-toolbar flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2.5 py-2 sm:px-4">
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {(
            [
              { key: "spread", icon: BookOpenText, label: "Spread" },
              { key: "grid", icon: Grid3x3, label: "Grid" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => dispatch({ type: "SET_VIEW_MODE", mode: m.key })}
              aria-label={`Tampilan ${m.label}`}
              aria-pressed={state.viewMode === m.key}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition",
                state.viewMode === m.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              )}
            >
              <m.icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {state.viewMode !== "grid" && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-1 py-0.5">
            <button
              disabled={sheetIndex === 0}
              onClick={() => setSheetIndex((i) => Math.max(0, i - 1))}
              aria-label="Lembar sebelumnya"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[72px] sm:min-w-[92px] text-center text-xs font-medium text-slate-600">
              Sheet {plan.sheets.length ? sheetIndex + 1 : 0} / {plan.sheets.length}
            </span>
            <button
              disabled={sheetIndex >= plan.sheets.length - 1}
              onClick={() => setSheetIndex((i) => Math.min(plan.sheets.length - 1, i + 1))}
              aria-label="Lembar berikutnya"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {isFolded && (
              <div className="ml-1 flex overflow-hidden rounded-lg border border-slate-200">
                <button
                  onClick={() => setSide("front")}
                  aria-pressed={side === "front"}
                  className={cn(
                    "px-2 py-1 text-[11px] font-semibold",
                    side === "front" ? "bg-slate-900 text-white" : "text-slate-500"
                  )}
                >
                  Front
                </button>
                <button
                  onClick={() => setSide("back")}
                  aria-pressed={side === "back"}
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
            onClick={() => dispatch({ type: "NUDGE_ZOOM", direction: -1 })}
            aria-label="Perkecil tampilan"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
            disabled={state.zoom <= ZOOM_MIN}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs font-semibold text-slate-600">
            {Math.round(state.zoom * 100)}%
          </span>
          <button
            onClick={() => dispatch({ type: "NUDGE_ZOOM", direction: 1 })}
            aria-label="Perbesar tampilan"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
            disabled={state.zoom >= ZOOM_MAX}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={fitToScreen}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
          >
            <Maximize2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pas</span>
          </button>
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
            aria-pressed={isFullscreen}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
          >
            <Expand className="h-3.5 w-3.5" />{" "}
            <span className="hidden sm:inline">{isFullscreen ? "Keluar" : "Layar penuh"}</span>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-100">
        {!state.pages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <BookOpenText className="h-10 w-10" />
            <p className="text-sm font-medium">Upload PDF untuk melihat pratinjau</p>
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
                  className="group rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                  // Skip layout and paint for thumbnails scrolled out of view: the
                  // grid renders every sheet, and a long book otherwise pays for
                  // all of them on first paint.
                  style={{ contentVisibility: "auto", containIntrinsicSize: "auto 260px" }}
                >
                  <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>Lembar {idx + 1}</span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600 group-hover:bg-indigo-100">
                      Sig {s.signature}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {[s.front.left, s.front.right].map((n, i) => (
                      <div
                        key={i}
                        className="flex aspect-[3/4] flex-1 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50"
                      >
                        {getPageThumb(state.pages, n)?.thumbnail ? (
                          <img src={getPageThumb(state.pages, n)!.thumbnail} alt={`Halaman ${n}`} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs font-bold text-slate-300">{n ?? "-"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 text-center text-[11px] text-slate-400">
                    Depan: {s.front.left ?? "–"} | {s.front.right ?? "–"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full">
            <div className="flex w-5 shrink-0 flex-col">
              <div className="h-5 shrink-0 border-b border-r border-slate-200 bg-white" />
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
                ref={dragAreaRef}
                className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)",
                  backgroundSize: `${scale * 10}px ${scale * 10}px`,
                  // Without this a finger drag is read as a page scroll, the browser
                  // fires pointercancel, and panning simply stops on touch screens.
                  touchAction: "none",
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{ transform: `translate(-50%,-50%) translate(${pan.x}px, ${pan.y}px)` }}
                >
                  <div
                    className="relative bg-white shadow-2xl ring-1 ring-slate-300"
                    style={{ width: sheetWpx, height: sheetHpx }}
                  >
                    {geometry && sidePlacements.length > 0 && <>{sidePlacements.map(renderPlacement)}</>}
                    {state.marks.showFoldMarks && isFolded && geometry && !geometry.block && (
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
                <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow">
                  <Move className="h-3 w-3" /> Geser untuk memindahkan
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
