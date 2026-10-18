import { BindingType, Orientation, PageInfo, SizeMM } from "../types";
import { chooseGrid, GridChoice, PagesPerSideSetting } from "./nup";
import { geometryConstants } from "./geometry";

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
 * The one place that answers "how many pages per side, on which grid".
 *
 * Preview and export both go through this so the sheet on screen is the sheet
 * on paper. Mark room is decided from the *print* toggle rather than the export
 * gate: reserving the larger room can only ever make the layout more
 * conservative, never produce a file the validator then rejects.
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
  return chooseGrid(input.paper, input.bookSize, input.binding, input.setting ?? "auto", {
    bleedMm: Math.max(0, input.bleedMm),
    gutterMm: Math.max(0, input.gutterMm),
    marksRoomMm: input.showCropMarks ? geometryConstants.cropGapMm + geometryConstants.cropLengthMm : 0,
  });
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
export function hiResWidthFor(widthMm: number, pxPerMm: number, devicePixelRatio = 1, cap = 1800): number {
  if (!Number.isFinite(widthMm) || !Number.isFinite(pxPerMm) || widthMm <= 0 || pxPerMm <= 0) return 0;
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 1 ? devicePixelRatio : 1;
  return Math.max(64, Math.min(cap, Math.ceil(widthMm * pxPerMm * dpr)));
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

export function getPageThumb(pages: PageInfo[], pageNumber: number | null): PageInfo | null {
  if (pageNumber === null) return null;
  if (pageNumber < 1 || pageNumber > pages.length) return null;
  const info = pages[pageNumber - 1];
  if (info.isBlank) return null;
  return info;
}
