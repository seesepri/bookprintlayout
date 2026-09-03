import { Orientation, PageInfo, SizeMM } from "../types";

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

export function getPageThumb(pages: PageInfo[], pageNumber: number | null): PageInfo | null {
  if (pageNumber === null) return null;
  if (pageNumber < 1 || pageNumber > pages.length) return null;
  const info = pages[pageNumber - 1];
  if (info.isBlank) return null;
  return info;
}
