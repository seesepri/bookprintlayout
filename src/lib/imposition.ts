import { BindingDirection, BindingType, Sheet, SheetSide } from "../types";
import type { SignatureRange } from "../types";

export interface ImpositionPlan {
  paddedTotal: number;
  sheets: Sheet[];
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
  bindingDirection: BindingDirection = "left"
): Sheet[] {
  const padded = padToMultiple(totalPages, 4);
  const sheets: Sheet[] = [];

  for (let i = 0; i < padded / 4; i++) {
    const front = orient(
      { left: toPlacement(4 * i + 1, totalPages, 0), right: toPlacement(4 * i + 2, totalPages, 0) },
      bindingDirection
    );
    const back = orient(
      { left: toPlacement(4 * i + 3, totalPages, 0), right: toPlacement(4 * i + 4, totalPages, 0) },
      bindingDirection
    );
    sheets.push({ index: i, signature: 1, front, back });
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
  bindingDirection: BindingDirection = "left"
): ImpositionPlan {
  const totalPages = Math.max(0, Math.floor(totalPagesRaw));

  if (binding === "perfect-binding") {
    const paddedTotal = padToMultiple(totalPages, 4);
    const sheets = computePerfectBindingSheets(totalPages, bindingDirection);
    return {
      paddedTotal,
      sheets,
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
