import { BindingType, Orientation, PageInfo, SizeMM } from "../types";
import { chooseGrid, GridChoice, GridRoom, PagesPerSideSetting } from "./nup";
import { geometryConstants } from "./geometry";

/**
 * Applies the user's orientation to a paper size.
 *
 * `auto` here only knows the 2-up spread, because that is all a paper size can
 * tell you on its own. Anything that knows the binding and the page density
 * must go through `resolveSheet` instead — otherwise a sheet that would hold a
 * 2x2 grid in the other orientation gets called "not enough paper".
 */
export function orientedPaperSize(paper: SizeMM, orientation: Orientation, bookSize: SizeMM): SizeMM {
  const pairIsWide = bookSize.width * 2 >= bookSize.height;
  const paperIsWide = paper.width >= paper.height;

  if (orientation === "portrait") {
    return paperIsWide ? { width: paper.height, height: paper.width } : paper;
  }
  if (orientation === "landscape") {
    return paperIsWide ? paper : { width: paper.height, height: paper.width };
  }
  // auto: choose orientation that best matches whether we're laying out a
  // wide (side-by-side) spread or a narrow single page
  if (pairIsWide) {
    return paperIsWide ? paper : { width: paper.height, height: paper.width };
  }
  return paperIsWide ? { width: paper.height, height: paper.width } : paper;
}

/**
 * The room a denser grid has to leave around itself.
 *
 * Mark room is decided from the *print* toggle rather than the export gate:
 * reserving the larger room can only ever make the layout more conservative,
 * never produce a file the validator then rejects.
 */
export function gridRoomFor(input: { bleedMm: number; gutterMm: number; showCropMarks: boolean }): GridRoom {
  return {
    bleedMm: Math.max(0, input.bleedMm),
    gutterMm: Math.max(0, input.gutterMm),
    marksRoomMm: input.showCropMarks ? geometryConstants.cropGapMm + geometryConstants.cropLengthMm : 0,
  };
}

/**
 * The one place that answers "how many pages per side, on which grid".
 *
 * Takes a paper that is *already oriented*. Callers that still have the user's
 * orientation setting in hand want `resolveSheet` instead — it does the
 * orientation and the density together, which is the only way `auto` can pick
 * the sheet that actually fits four pages.
 */
export function resolveSheetLayout(input: {
  paper: SizeMM;
  bookSize: SizeMM;
  binding: BindingType;
  setting?: PagesPerSideSetting;
  bleedMm: number;
  gutterMm: number;
  showCropMarks: boolean;
}): GridChoice {
  return chooseGrid(input.paper, input.bookSize, input.binding, input.setting ?? "auto", gridRoomFor(input));
}

export interface SheetInput {
  /** Paper as the user picked it, before any orientation is applied. */
  paper: SizeMM;
  orientation: Orientation;
  bookSize: SizeMM;
  binding: BindingType;
  setting?: PagesPerSideSetting;
  bleedMm: number;
  gutterMm: number;
  showCropMarks: boolean;
}

export interface SheetResolution {
  /** Paper after orientation, i.e. the sheet that is actually printed. */
  paper: SizeMM;
  layout: GridChoice;
}

/**
 * Orientation and page density decided together.
 *
 * `orientedPaperSize` alone can only see the 2-up spread, so on a paper where
 * portrait would carry a 2x2 grid and landscape would not (SRA3 with A5 pages,
 * for one) `auto` used to pick the landscape sheet and then report "4-up does
 * not fit" — the grid was never tried in the orientation that holds it. Trying
 * both orientations and preferring the denser grid fixes that, while an equal
 * density still resolves exactly as it always did, so no existing project
 * changes the paper it prints on.
 */
export function resolveSheet(input: SheetInput): SheetResolution {
  const room = gridRoomFor(input);
  const attempt = (orientation: "portrait" | "landscape"): SheetResolution => {
    const paper = orientedPaperSize(input.paper, orientation, input.bookSize);
    return { paper, layout: chooseGrid(paper, input.bookSize, input.binding, input.setting ?? "auto", room) };
  };

  if (input.orientation !== "auto") return attempt(input.orientation);

  const portrait = attempt("portrait");
  const landscape = attempt("landscape");
  if (portrait.layout.slotsPerSide !== landscape.layout.slotsPerSide) {
    return portrait.layout.slotsPerSide > landscape.layout.slotsPerSide ? portrait : landscape;
  }

  // Same density either way: keep the historical choice, so the orientation
  // only changes when it buys extra pages per side.
  const legacy = orientedPaperSize(input.paper, "auto", input.bookSize);
  return legacy.width === portrait.paper.width ? portrait : landscape;
}

/**
 * Pixels a page needs on screen, at the current zoom, on this device.
 *
 * The canvas draws a sheet at `pxPerMm * zoom` CSS pixels per millimetre, while
 * the artwork behind it was rasterised once at upload time (220 px, lossy). That
 * gap is the whole reason the preview reads as blurry: a 148 mm page at 100%
 * zoom on a 2x display wants ~770 px. Rasterise to what is on screen, and cap
 * it so a deep zoom cannot allocate a canvas the tab cannot hold.
 */
/**
 * Raster width for a page shown at `pxPerMm` on this device.
 *
 * The floor is 2x the CSS size, not 1x: at 1 devicePixelRatio a page drawn
 * 230 px wide would otherwise be rasterised at 230 px, which is the very
 * thumbnail the preview is supposed to replace. Supersampling and letting the
 * browser downscale is what makes text read as sharp on a plain display.
 */
/**
 * The one zoom range for the whole preview.
 *
 * Before this existed the range was written out four times and the four copies
 * disagreed: the wheel stopped at 3, the plus button reached 4, and `fitToScreen`
 * capped itself at 2.5. Zooming to 400% with the button and then scrolling once
 * dropped the view to 290%. Every entry point goes through `clampZoom` now, and
 * the reducer clamps as well so a future caller cannot slip past it.
 */
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;
/** One wheel notch or one click of the +/- buttons. */
export const ZOOM_STEP = 0.15;
const ZOOM_WHEEL_STEP = 0.1;

/** Rounds to 2 decimals so 0.1 + 0.2 style drift never shows up in the toolbar. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Number(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)).toFixed(2));
}

export function zoomStep(current: number, direction: 1 | -1, step = ZOOM_STEP): number {
  return clampZoom(current + direction * step);
}

export function zoomFromWheel(current: number, deltaY: number): number {
  return zoomStep(current, deltaY > 0 ? -1 : 1, ZOOM_WHEEL_STEP);
}

export function hiResWidthFor(
  widthMm: number,
  pxPerMm: number,
  devicePixelRatio = 1,
  cap = 2600,
  supersample = 2
): number {
  if (!Number.isFinite(widthMm) || !Number.isFinite(pxPerMm) || widthMm <= 0 || pxPerMm <= 0) return 0;
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 1 ? devicePixelRatio : 1;
  const ratio = Math.max(dpr, Number.isFinite(supersample) && supersample > 1 ? supersample : 1);
  return Math.max(64, Math.min(cap, Math.ceil(widthMm * pxPerMm * ratio)));
}

/**
 * Encoding for a preview raster.
 *
 * Lossy JPEG rings around black text on white, and that smearing is exactly
 * what reads as "blurry" in a document preview, so small rasters are PNG. A
 * deep zoom is big enough that file size (a base64 string in the DOM) starts
 * to matter more than the ringing, so it falls back to a high-quality JPEG.
 */
export function thumbnailFormatFor(widthPx: number, pngUntil = 1400): { format: "png" | "jpeg"; quality: number } {
  return widthPx <= pngUntil ? { format: "png", quality: 1 } : { format: "jpeg", quality: 0.92 };
}

/**
 * Hysteresis so dragging the zoom slider does not re-rasterise on every tick:
 * only chase a materially sharper target than what is already cached.
 */
export function shouldRenderHiRes(cachedWidth: number | undefined, wantedWidth: number): boolean {
  if (wantedWidth <= 0) return false;
  if (!cachedWidth) return true;
  return wantedWidth > cachedWidth * 1.25;
}

/**
 * Drops cached rasters for pages that left the screen.
 *
 * Without this the cache only ever grew: one data URL per page ever viewed, kept
 * until the source file changed. On a 400-page book that is hundreds of images
 * held for a session nobody can see. The cost of pruning is one re-render when the
 * user pages back — cheap next to unbounded memory.
 *
 * Returns the *same object* when nothing needs dropping, so the caller can skip a
 * re-render entirely.
 */
export function pruneToVisible<T>(cache: Record<number, T>, visible: Iterable<number>): Record<number, T> {
  const keep = new Set(visible);
  const keys = Object.keys(cache);
  if (keys.every((key) => keep.has(Number(key)))) return cache;
  const next: Record<number, T> = {};
  for (const key of keys) {
    if (keep.has(Number(key))) next[Number(key)] = cache[Number(key)];
  }
  return next;
}

export function getPageThumb(pages: PageInfo[], pageNumber: number | null): PageInfo | null {
  if (pageNumber === null) return null;
  if (pageNumber < 1 || pageNumber > pages.length) return null;
  const info = pages[pageNumber - 1];
  if (info.isBlank) return null;
  return info;
}
