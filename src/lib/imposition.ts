import { BindingDirection, BindingType, Sheet, SheetSide } from "../types";
import type { SignatureRange } from "../types";

export interface ImpositionPlan {
  paddedTotal: number;
  sheets: Sheet[];
  /** Pages per sheet side the plan was built for (2 = the classic spread). */
  slotsPerSide?: number;
  signatures: SignatureRange[];
  /**
   * Number of sheets inside each signature, keyed by signature index.
   *
   * Creep is a per-signature effect: every signature is folded as its own
   * stack, so the outermost sheet of *each* signature needs the largest shift.
   * Callers must feed this back into the creep calculation instead of the
   * global sheet count, otherwise later signatures in a multi-signature book
   * get an inflated shift.
   */
  signatureSheetCounts: Record<number, number>;
}

export function padToMultiple(pageCount: number, multiple: number): number {
  if (multiple <= 0) return pageCount;
  const remainder = pageCount % multiple;
  return remainder === 0 ? pageCount : pageCount + (multiple - remainder);
}

export function blankPagesNeeded(pageCount: number, multiple: number): number {
  return padToMultiple(pageCount, multiple) - pageCount;
}

/** Pages beyond the real page count become virtual blanks (null). */
function toPlacement(pageNumber: number, realPages: number, offset: number): number | null {
  return pageNumber > realPages ? null : pageNumber + offset;
}

/** Mirror a spread for right-to-left binding. */
function orient(side: SheetSide, direction: BindingDirection): SheetSide {
  if (direction !== "right") return side;
  return { left: side.right, right: side.left };
}

/** Classic booklet order for a single signature/booklet. */
export function computeBookletSheets(
  totalPages: number,
  signatureIndex = 1,
  offset = 0,
  bindingDirection: BindingDirection = "left"
): Sheet[] {
  const padded = padToMultiple(totalPages, 4);
  const sheets: Sheet[] = [];

  for (let i = 0; i < padded / 4; i++) {
    const frontLeft = toPlacement(padded - 2 * i, totalPages, offset);
    const frontRight = toPlacement(2 * i + 1, totalPages, offset);
    const backLeft = toPlacement(2 * i + 2, totalPages, offset);
    const backRight = toPlacement(padded - 2 * i - 1, totalPages, offset);

    sheets.push({
      index: i,
      signature: signatureIndex,
      front: orient({ left: frontLeft, right: frontRight }, bindingDirection),
      back: orient({ left: backLeft, right: backRight }, bindingDirection),
    });
  }

  return sheets;
}

/**
 * Perfect binding: sheets are not folded, they are stacked and glued, so pages
 * run in reading order — two pages on the front, the next two on the back of
 * the same sheet (flip on short edge). Printing front-side only would double
 * the paper needed for the same book.
 */
export function computePerfectBindingSheets(
  totalPages: number,
  bindingDirection: BindingDirection = "left",
  slotsPerSide = 2
): Sheet[] {
  const slots = Math.max(2, Math.floor(slotsPerSide));
  const perSheet = slots * 2;
  const padded = padToMultiple(totalPages, perSheet);
  const sheets: Sheet[] = [];

  // A glued book never folds, so density is free: the front side carries the
  // next `slots` pages in reading order and duplexing puts the rest on the back.
  // Slot order is row-major across the grid; for a two-page spread this is the
  // same left/right pair (plus the same right-to-left mirror) as always.
  const buildSide = (start: number) => {
    const raw = Array.from({ length: slots }, (_, k) => toPlacement(start + k, totalPages, 0));
    return bindingDirection === "right" ? raw.slice().reverse() : raw;
  };

  for (let i = 0; i < padded / perSheet; i++) {
    const front = buildSide(perSheet * i + 1);
    const back = buildSide(perSheet * i + slots + 1);
    const sheet: Sheet = {
      index: i,
      signature: 1,
      front: { left: front[0] ?? null, right: front[1] ?? null },
      back: { left: back[0] ?? null, right: back[1] ?? null },
    };
    if (slots > 2) {
      sheet.slotsPerSide = slots;
      sheet.frontSlots = front;
      sheet.backSlots = back;
    }
    sheets.push(sheet);
  }

  return sheets;
}

/**
 * A folded sheet carrying two spreads per side: the top band is one sheet of the
 * normal booklet plan, the bottom band the next one.
 *
 * Page order is never re-derived here — it is whatever `computeBookletSheets`
 * already produces, which is the layout every existing booklet prints with. The
 * only new thing is that two of those sheets share a physical sheet, so the
 * total drops by half and the printer folds once along the vertical line.
 */
export function computeBookletQuadSheets(
  totalPages: number,
  bindingDirection: BindingDirection = "left"
): Sheet[] {
  // Two booklet sheets per physical sheet, and a booklet sheet is 4 pages, so a
  // quad sheet is 8: pad to that and every sheet really does have a bottom band.
  const padded = padToMultiple(Math.max(0, Math.floor(totalPages)), 8);
  const base = computeBookletSheets(padded, 1, 0, bindingDirection);
  const sheets: Sheet[] = [];
  for (let i = 0; i < base.length; i += 2) {
    const top = base[i];
    const bottom = base[i + 1] ?? top;
    sheets.push({
      index: sheets.length,
      signature: 1,
      slotsPerSide: 4,
      front: top.front,
      back: top.back,
      frontSlots: [top.front.left, top.front.right, bottom.front.left, bottom.front.right],
      backSlots: [top.back.left, top.back.right, bottom.back.left, bottom.back.right],
    });
  }
  return sheets;
}

export function computeSignatureRanges(totalPages: number, sigSize: number): SignatureRange[] {
  const safeSize = Math.max(4, Math.floor(sigSize / 4) * 4);
  const ranges: SignatureRange[] = [];
  let start = 1;
  let index = 1;

  while (start <= totalPages) {
    const end = Math.min(start + safeSize - 1, totalPages);
    ranges.push({ index, startPage: start, endPage: end, pageCount: end - start + 1 });
    start = end + 1;
    index += 1;
  }

  return ranges;
}

/**
 * Creates the complete print order. Padding is virtual: no PageInfo is
 * created or mutated for pages introduced only to complete a booklet.
 */
export function planImposition(
  totalPagesRaw: number,
  binding: BindingType,
  signatureSize = 16,
  bindingDirection: BindingDirection = "left",
  options: { slotsPerSide?: number } = {}
): ImpositionPlan {
  const totalPages = Math.max(0, Math.floor(totalPagesRaw));

  if (binding === "perfect-binding") {
    const slots = Math.max(2, Math.floor(options.slotsPerSide ?? 2));
    const paddedTotal = padToMultiple(totalPages, slots * 2);
    const sheets = computePerfectBindingSheets(totalPages, bindingDirection, slots);
    return {
      paddedTotal,
      sheets,
      slotsPerSide: slots > 2 ? slots : undefined,
      signatures: totalPages ? [{ index: 1, startPage: 1, endPage: totalPages, pageCount: totalPages }] : [],
      signatureSheetCounts: { 1: sheets.length },
    };
  }

  if (binding === "signature") {
    const signatureMultiple = Math.max(4, Math.floor(signatureSize / 4) * 4);
    const ranges = computeSignatureRanges(totalPages, signatureMultiple);
    const signatures: SignatureRange[] = [];
    const signatureSheetCounts: Record<number, number> = {};
    let sheets: Sheet[] = [];
    let paddedTotal = 0;

    for (const range of ranges) {
      const localCount = padToMultiple(range.pageCount, 4);
      const paddedRange = { ...range, pageCount: localCount, endPage: range.startPage + localCount - 1 };
      signatures.push(paddedRange);
      const localSheets = computeBookletSheets(localCount, range.index, range.startPage - 1, bindingDirection);
      signatureSheetCounts[range.index] = localSheets.length;
      sheets = sheets.concat(localSheets);
      paddedTotal += localCount;
    }

    return { paddedTotal, sheets, signatures, signatureSheetCounts };
  }

  const slots = Math.max(2, Math.floor(options.slotsPerSide ?? 2));
  // `signature` never reaches here: it returns above, and nup.ts keeps it on a
  // spread. So a folded 4-up is exactly booklet / saddle-stitch.
  if (slots === 4) {
    const sheets = computeBookletQuadSheets(totalPages, bindingDirection);
    const paddedTotal = sheets.length * 8;
    return {
      paddedTotal,
      sheets,
      slotsPerSide: 4,
      signatures: totalPages ? [{ index: 1, startPage: 1, endPage: totalPages, pageCount: totalPages }] : [],
      signatureSheetCounts: { 1: sheets.length },
    };
  }

  const paddedTotal = padToMultiple(totalPages, 4);
  const sheets = computeBookletSheets(totalPages, 1, 0, bindingDirection);
  return {
    paddedTotal,
    sheets,
    signatures: totalPages ? [{ index: 1, startPage: 1, endPage: totalPages, pageCount: totalPages }] : [],
    signatureSheetCounts: { 1: sheets.length },
  };
}

/**
 * How far a page should be shifted outward to survive trimming.
 *
 * `totalSheets` must be the sheet count of the *sheet's own signature*, and
 * `sheetPositionFromOuter` is its position inside that signature (1 = outermost).
 * The auto rule is the classic linear approximation: every sheet between the
 * one being shifted and the centre of the fold pushes the block outward by
 * roughly twice the caliper of one sheet.
 */
export function computeCreepShiftMm(
  sheetPositionFromOuter: number,
  totalSheets: number,
  paperThicknessMm: number,
  mode: "auto" | "manual" = "auto",
  manualAmountMm = 0
): number {
  const count = Math.max(1, Math.floor(totalSheets));
  const position = Math.min(count, Math.max(1, Math.floor(sheetPositionFromOuter)));
  const distanceFromCenter = Math.max(0, count - position);
  if (mode === "manual") {
    const maxShift = Math.max(0, manualAmountMm);
    return count <= 1 ? 0 : maxShift * (distanceFromCenter / (count - 1));
  }
  return Math.max(0, paperThicknessMm) * 2 * distanceFromCenter;
}
