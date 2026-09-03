import { BindingType, Sheet, SignatureRange } from "../types";

export function padToMultiple(pageCount: number, multiple: number): number {
  if (multiple <= 0) return pageCount;
  const remainder = pageCount % multiple;
  return remainder === 0 ? pageCount : pageCount + (multiple - remainder);
}

export function blankPagesNeeded(pageCount: number, multiple: number): number {
  return padToMultiple(pageCount, multiple) - pageCount;
}

/** Classic booklet order for a single signature/booklet. */
export function computeBookletSheets(totalPages: number, signatureIndex = 1, offset = 0, bindingDirection: "left" | "right" = "left"): Sheet[] {
  const padded = padToMultiple(totalPages, 4);
  const sheets: Sheet[] = [];

  for (let i = 0; i < padded / 4; i++) {
    const frontLeft = padded - 2 * i;
    const frontRight = 2 * i + 1;
    const backLeft = 2 * i + 2;
    const backRight = padded - 2 * i - 1;

    const toPageNum = (raw: number): number | null => (raw > totalPages ? null : raw + offset);

    const front = { left: toPageNum(frontLeft), right: toPageNum(frontRight) };
    const back = { left: toPageNum(backLeft), right: toPageNum(backRight) };
    if (bindingDirection === "right") {
      [front.left, front.right] = [front.right, front.left];
      [back.left, back.right] = [back.right, back.left];
    }
    sheets.push({ index: i, signature: signatureIndex, front, back });
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
  bindingDirection: "left" | "right" = "left"
): { paddedTotal: number; sheets: Sheet[]; signatures: SignatureRange[] } {
  const totalPages = Math.max(0, Math.floor(totalPagesRaw));

  if (binding === "perfect-binding") {
    const paddedTotal = padToMultiple(totalPages, 2);
    const sheets: Sheet[] = [];

    for (let i = 0; i < paddedTotal / 2; i++) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let front = {
        left: left <= totalPages ? left : null,
        right: right <= totalPages ? right : null,
      };
      if (bindingDirection === "right") [front.left, front.right] = [front.right, front.left];
      sheets.push({ index: i, signature: 1, front, back: { left: null, right: null } });
    }

    return {
      paddedTotal,
      sheets,
      signatures: totalPages ? [{ index: 1, startPage: 1, endPage: totalPages, pageCount: totalPages }] : [],
    };
  }

  if (binding === "signature") {
    const signatureMultiple = Math.max(4, Math.floor(signatureSize / 4) * 4);
    const ranges = computeSignatureRanges(totalPages, signatureMultiple);
    const signatures: SignatureRange[] = [];
    let sheets: Sheet[] = [];
    let paddedTotal = 0;

    for (const range of ranges) {
      const localCount = padToMultiple(range.pageCount, 4);
      const paddedRange = { ...range, pageCount: localCount, endPage: range.startPage + localCount - 1 };
      signatures.push(paddedRange);
      sheets = sheets.concat(
        computeBookletSheets(localCount, range.index, range.startPage - 1, bindingDirection)
      );
      paddedTotal += localCount;
    }

    return { paddedTotal, sheets, signatures };
  }

  const paddedTotal = padToMultiple(totalPages, 4);
  return {
    paddedTotal,
    sheets: computeBookletSheets(totalPages, 1, 0, bindingDirection),
    signatures: totalPages ? [{ index: 1, startPage: 1, endPage: totalPages, pageCount: totalPages }] : [],
  };
}

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
