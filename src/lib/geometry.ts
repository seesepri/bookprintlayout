import { BindingType, CreepSettings, MarksSettings, PageInfo, Sheet, SizeMM } from "../types";
import { mmToPt } from "./paperSizes";
import { computeCreepShiftMm } from "./imposition";

export interface RectMM {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PagePlacement {
  pageNumber: number | null;
  trim: RectMM;
  bleed: RectMM;
  safe: RectMM;
  rotation: PageInfo["rotation"];
}

export interface CropMarkGeometry {
  x: number;
  y: number;
  dx: -1 | 1;
  dy: -1 | 1;
}

export interface SheetGeometry {
  paper: SizeMM;
  front: { left: PagePlacement; right: PagePlacement };
  back: { left: PagePlacement; right: PagePlacement };
  cropMarks: CropMarkGeometry[];
  cropGapMm: number;
  cropLengthMm: number;
  foldX: number;
}

export interface ImpositionValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiredSheet: SizeMM;
}

const CROP_GAP_MM = 2;
const CROP_LENGTH_MM = 5;
const EPSILON = 0.01;

function rect(x: number, y: number, width: number, height: number): RectMM {
  return { x, y, width, height };
}

function insetRect(r: RectMM, top: number, right: number, bottom: number, left: number): RectMM {
  return {
    x: r.x + left,
    y: r.y + bottom,
    width: r.width - left - right,
    height: r.height - top - bottom,
  };
}

function validPositiveSize(size: SizeMM): boolean {
  return Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
}

function pagePlacement(
  pageNumber: number | null,
  trim: RectMM,
  bleedMm: number,
  gutterMm: number,
  safeAreaMm: number,
  bindingDirection: "left" | "right",
  side: "left" | "right",
  pages: PageInfo[],
  creepShiftMm = 0
): PagePlacement {
  const isBindingEdge = (bindingDirection === "left" && side === "left") || (bindingDirection === "right" && side === "right");
  const info = pageNumber && pageNumber >= 1 && pageNumber <= pages.length ? pages[pageNumber - 1] : undefined;
  const rotation = info?.rotation ?? 0;

  const inside = (isBindingEdge ? gutterMm : 0) + safeAreaMm;
  const outside = safeAreaMm;
  const top = safeAreaMm;
  const bottom = safeAreaMm;
  const creepDirection = side === "left" ? -1 : 1;
  const shiftedTrim = { ...trim, x: trim.x + creepDirection * Math.max(0, creepShiftMm) };

  return {
    pageNumber,
    trim: shiftedTrim,
    bleed: rect(shiftedTrim.x - bleedMm, shiftedTrim.y - bleedMm, shiftedTrim.width + bleedMm * 2, shiftedTrim.height + bleedMm * 2),
    safe: isBindingEdge
      ? insetRect(shiftedTrim, top, outside, bottom, inside)
      : insetRect(shiftedTrim, top, inside, bottom, outside),
    rotation,
  };
}

export function buildSheetGeometry(params: {
  sheet: Sheet;
  paper: SizeMM;
  bookSize: SizeMM;
  bleedMm: number;
  gutterMm: number;
  safeAreaMm: number;
  binding: BindingType;
  bindingDirection?: "left" | "right";
  pages: PageInfo[];
  marks: MarksSettings;
  creep?: CreepSettings;
  /** Sheets inside this sheet's own signature — drives the creep schedule. */
  signatureSheetCount?: number;
}): SheetGeometry {
  const {
    sheet,
    paper,
    bookSize,
    bleedMm,
    gutterMm,
    safeAreaMm,
    binding,
    bindingDirection = "left",
    pages,
    creep,
    signatureSheetCount = 1,
  } = params;

  const pairGap = binding === "perfect-binding" ? Math.max(0, gutterMm) : 0;
  const pairWidth = bookSize.width * 2 + pairGap;
  const originX = (paper.width - pairWidth) / 2;
  const originY = (paper.height - bookSize.height) / 2;
  const leftTrim = rect(originX, originY, bookSize.width, bookSize.height);
  const rightTrim = rect(originX + bookSize.width + pairGap, originY, bookSize.width, bookSize.height);
  // Creep restarts per signature: sheet 1 is the outermost sheet of *its*
  // signature, so the schedule must be relative to that signature's depth.
  const effectiveCreep = binding === "perfect-binding" || !creep
    ? 0
    : computeCreepShiftMm(
        sheet.index + 1,
        signatureSheetCount,
        creep.paperThicknessMm,
        creep.mode,
        creep.manualAmountMm
      );

  const makeSide = (left: number | null, right: number | null) => ({
    left: pagePlacement(left, leftTrim, bleedMm, gutterMm, safeAreaMm, bindingDirection, "left", pages, effectiveCreep),
    right: pagePlacement(right, rightTrim, bleedMm, gutterMm, safeAreaMm, bindingDirection, "right", pages, effectiveCreep),
  });

  return {
    paper,
    front: makeSide(sheet.front.left, sheet.front.right),
    back: makeSide(sheet.back.left, sheet.back.right),
    cropMarks: [
      { x: leftTrim.x - effectiveCreep, y: leftTrim.y, dx: -1, dy: -1 },
      { x: rightTrim.x + rightTrim.width + effectiveCreep, y: rightTrim.y, dx: 1, dy: -1 },
      { x: leftTrim.x - effectiveCreep, y: leftTrim.y + leftTrim.height, dx: -1, dy: 1 },
      { x: rightTrim.x + rightTrim.width + effectiveCreep, y: rightTrim.y + rightTrim.height, dx: 1, dy: 1 },
    ],
    cropGapMm: CROP_GAP_MM,
    cropLengthMm: CROP_LENGTH_MM,
    foldX: leftTrim.x + leftTrim.width,
  };
}

function requiredSheetSize(bookSize: SizeMM, bleedMm: number, gutterMm: number, binding: BindingType, marks: MarksSettings): SizeMM {
  // Crop marks are drawn only at the four outer corners of the imposed
  // spread. The center is a fold/binding edge, not an outer cut edge for
  // booklet work, so marks there would run into the neighboring artwork.
  const cropExtra = marks.showCropMarks ? CROP_GAP_MM + CROP_LENGTH_MM : 0;
  return {
    width: bookSize.width * 2 + (binding === "perfect-binding" ? Math.max(0, gutterMm) : 0) + bleedMm * 2 + cropExtra * 2,
    height: bookSize.height + bleedMm * 2 + cropExtra * 2,
  };
}

/** Below this a "mark" is a stub nobody can trim against: skip it instead. */
export const MIN_MARK_SPAN_PT = 4;

/**
 * How far a mark may reach, given the room between the trim edge and the edge
 * of the physical sheet. Shared by the renderer and the geometry check so the
 * two can never disagree about what "there is no room for marks" means.
 *
 * Returns null when the mark would be useless; the caller skips that axis.
 */
export function fitMarkRun(
  roomPt: number,
  gapPt: number,
  lenPt: number
): { gapPt: number; spanPt: number } | null {
  if (!Number.isFinite(roomPt) || !Number.isFinite(gapPt) || !Number.isFinite(lenPt)) return null;
  const spanPt = Math.min(gapPt + lenPt, roomPt - 1);
  if (spanPt < MIN_MARK_SPAN_PT) return null;
  // Keep the gap proportionally smaller than the mark itself, the way a
  // traditional layout mark reads: a short gap, then a longer line.
  return { gapPt: Math.min(gapPt, spanPt * 0.4), spanPt };
}

function fits(required: SizeMM, paper: SizeMM): boolean {
  return required.width <= paper.width + EPSILON && required.height <= paper.height + EPSILON;
}

export function validateImposition(params: {
  pages: PageInfo[];
  sheets: Sheet[];
  sheetCount: number;
  /** Sheets per signature, used to size the worst-case creep shift. */
  signatureSheetCounts?: Record<number, number>;
  paddedTotal: number;
  paper: SizeMM;
  bookSize: SizeMM;
  bleedMm: number;
  gutterMm: number;
  safeAreaMm: number;
  marks: MarksSettings;
  binding: BindingType;
  creep?: CreepSettings;
}): ImpositionValidation {
  const { pages, sheets, sheetCount, signatureSheetCounts, paddedTotal, paper, bookSize, bleedMm, gutterMm, safeAreaMm, marks, binding, creep } = params;
  const errors: string[] = [];
  const warnings: string[] = [];
  const deepestSignature = Math.max(1, ...Object.values(signatureSheetCounts ?? { 1: sheetCount }));
  const maxCreep = binding === "perfect-binding" || !creep
    ? 0
    : computeCreepShiftMm(1, deepestSignature, creep.paperThicknessMm, creep.mode, creep.manualAmountMm);
  const baseRequired = requiredSheetSize(bookSize, Math.max(0, bleedMm), gutterMm, binding, marks);
  const requiredSheet = { ...baseRequired, width: baseRequired.width + maxCreep * 2 };

  if (!validPositiveSize(paper)) errors.push("Ukuran kertas tidak valid.");
  if (!validPositiveSize(bookSize)) errors.push("Ukuran buku/trim tidak valid.");
  // Every binding fills 4 pages per physical sheet: booklet/saddle/signature by
  // folding, perfect binding by duplexing the back side.
  const expectedSheets = Math.ceil(paddedTotal / 4);
  if (sheetCount !== expectedSheets && pages.length > 0) {
    errors.push("Jumlah sheet imposition tidak konsisten dengan padding binding.");
  }

  const seen = new Map<number, number>();
  for (const sheet of sheets) {
    const sides = [sheet.front.left, sheet.front.right, sheet.back.left, sheet.back.right];
    for (const pageNumber of sides) {
      if (pageNumber !== null) seen.set(pageNumber, (seen.get(pageNumber) ?? 0) + 1);
    }
  }
  // Only real pages must appear exactly once. Slots added by padding are
  // virtual (rendered as blanks by the engine), so they legitimately have no
  // page number — checking up to paddedTotal rejected every book whose length
  // was not a multiple of 4 and blocked export outright.
  for (let pageNumber = 1; pageNumber <= Math.min(pages.length, paddedTotal); pageNumber++) {
    if ((seen.get(pageNumber) ?? 0) !== 1) {
      errors.push(`Urutan imposition tidak valid: halaman ${pageNumber} tidak muncul tepat satu kali.`);
      break;
    }
  }
  for (const pageNumber of seen.keys()) {
    if (pageNumber < 1 || pageNumber > paddedTotal) {
      errors.push(`Nomor halaman imposition ${pageNumber} berada di luar range padded total.`);
      break;
    }
  }
  if (paddedTotal < pages.length) errors.push("Padded page count lebih kecil dari jumlah halaman asli.");
  if (!fits(requiredSheet, paper)) {
    errors.push(
      `Layout tidak muat pada kertas. Required ${requiredSheet.width.toFixed(1)} × ${requiredSheet.height.toFixed(1)} mm, selected ${paper.width.toFixed(1)} × ${paper.height.toFixed(1)} mm.`
    );
  }

  const numericValues = [bleedMm, gutterMm, safeAreaMm, maxCreep];
  if (numericValues.some((v) => !Number.isFinite(v) || v < 0)) {
    errors.push("Bleed, safe area, gutter, dan creep tidak boleh bernilai negatif atau tidak valid.");
  }
  if (marks.showSafeArea && (safeAreaMm * 2 >= bookSize.height || gutterMm + safeAreaMm * 2 >= bookSize.width)) {
    errors.push("Gutter/safe area terlalu besar sehingga safe/content area menjadi tidak valid.");
  }

  const sourceSizes = pages.filter((p) => !p.isBlank).map((p) => `${p.widthPt.toFixed(2)}x${p.heightPt.toFixed(2)}`);
  if (new Set(sourceSizes).size > 1) {
    warnings.push("Ukuran halaman sumber tidak konsisten. Artwork akan dipertahankan tanpa distortion, tetapi hasil dapat memiliki skala berbeda antar halaman.");
  }

  if (bleedMm > 0 && !marks.showCropMarks) {
    warnings.push("Bleed aktif tanpa crop marks; pastikan proses finishing/cutting memiliki acuan trim yang sesuai.");
  }

  return { valid: errors.length === 0, errors, warnings, requiredSheet };
}

export const geometryConstants = {
  cropGapMm: CROP_GAP_MM,
  cropLengthMm: CROP_LENGTH_MM,
  mmToPt,
};
