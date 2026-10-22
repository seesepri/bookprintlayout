import { BindingType, CreepSettings, MarksSettings, PageInfo, Sheet, SheetSide, SizeMM } from "../types";
import { GridSpec, PAIR_GRID, gridSheetSize, isFoldedBinding, slotCount, slotIndexFromPosition } from "./nup";
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
  /** 0 means "tick only along x": used where a cut line has no trim edge. */
  dy: -1 | 0 | 1;
}

export interface SheetGeometry {
  paper: SizeMM;
  front: { left: PagePlacement; right: PagePlacement };
  back: { left: PagePlacement; right: PagePlacement };
  cropMarks: CropMarkGeometry[];
  /** Trim block (mm from the bottom-left); only a denser grid has one. */
  block?: RectMM;
  cropGapMm: number;
  cropLengthMm: number;
  foldX: number;
  /** Row-major placements (index 0 = top-left) when the sheet is denser than a spread. */
  frontSlots?: PagePlacement[];
  backSlots?: PagePlacement[];
  /** Grid the sheet was laid out on; absent means the classic 2x1 spread. */
  grid?: GridSpec;
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
  /** Pages-per-side grid. Defaults to the classic 2x1 spread. */
  grid?: GridSpec;
  /**
   * Denser folded sheets: turn the top band 180° so both bands meet head to
   * head and one fold binds them. False prints the band upright instead, for
   * shops that guillotine the sheet and rotate the halves by hand.
   */
  quadHeadToHead?: boolean;
}): SheetGeometry {
  const grid = params.grid ?? PAIR_GRID;
  if (slotCount(grid) > 2) return buildGridGeometry({ ...params, grid }, grid);
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

function requiredSheetSize(
  bookSize: SizeMM,
  bleedMm: number,
  gutterMm: number,
  binding: BindingType,
  marks: MarksSettings,
  grid: GridSpec = PAIR_GRID
): SizeMM {
  // Crop marks are drawn only at the outer corners of the imposed block. The
  // center is a fold/binding edge, not an outer cut edge for booklet work, so
  // marks there would run into the neighbouring artwork.
  const cropExtra =
    marks.showCropMarks && slotCount(grid) <= 2 ? CROP_GAP_MM + CROP_LENGTH_MM : 0;
  // One sizing rule for every grid, shared with the layout chooser, so the
  // check can never disagree with what was actually placed: both measure a
  // denser grid on the block alone (see chooseGrid), which is also the size the
  // guillotine cuts to.
  return gridSheetSize(bookSize, grid, {
    bleedMm: Math.max(0, bleedMm),
    gutterMm: binding === "perfect-binding" ? Math.max(0, gutterMm) : 0,
    marksRoomMm: cropExtra,
  });
}

/**
 * A denser-than-spread sheet: `cols x rows` book pages, row-major, centred on
 * the paper. Only reachable for bindings that are not folded (see nup.ts), so
 * there is no creep and no fold line: the gutter separates the two columns and
 * rows stack flush because every page keeps its own safe area.
 */
function buildGridGeometry(
  params: Parameters<typeof buildSheetGeometry>[0] & { grid: GridSpec },
  grid: GridSpec
): SheetGeometry {
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
    quadHeadToHead = true,
  } = params;
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const gap = binding === "perfect-binding" ? Math.max(0, gutterMm) : 0;
  const blockW = bookSize.width * cols + gap * (cols - 1);
  const blockH = bookSize.height * rows;
  const originX = (paper.width - blockW) / 2;
  const originY = (paper.height - blockH) / 2;

  /*
   * Head-to-head: the band that folds over the other one has to come off the
   * press upside down, and a 180° turn of a two-page band also mirrors its
   * columns, so the page that reads on the left of the booklet sits on the right
   * of the printed band. The bottom band is the one that stays put.
   */
  const headToHead = rows > 1 && isFoldedBinding(binding) && quadHeadToHead;
  const isTopBand = (row: number): boolean => headToHead && row === 0;

  // Geometry is millimetres measured from the bottom-left, so visual row 0 has
  // to sit highest on the sheet.
  const slotTrim = (index: number, colOverride?: number): RectMM => {
    const { col, row } = slotIndexFromPosition(grid, index);
    const use = colOverride ?? col;
    return rect(
      originX + use * (bookSize.width + gap),
      originY + (rows - 1 - row) * bookSize.height,
      bookSize.width,
      bookSize.height
    );
  };

  const sidePlacements = (slots: (number | null)[] | undefined, fallback: SheetSide): PagePlacement[] => {
    const numbers = slots && slots.length === cols * rows ? slots : [fallback.left, fallback.right];
    return numbers.map((pageNumber, index) => {
      const { col, row } = slotIndexFromPosition(grid, index);
      const flip = isTopBand(row);
      const placement = pagePlacement(
        pageNumber,
        slotTrim(index, flip ? cols - 1 - col : col),
        bleedMm,
        gutterMm,
        safeAreaMm,
        bindingDirection,
        col === 0 ? "left" : "right",
        pages,
        0
      );
      // The page's own rotation (from the page browser) stays; the band turn is
      // added on top of it, and both the renderer and the exporter read this one.
      return flip
        ? { ...placement, rotation: (((placement.rotation + 180) % 360) as PagePlacement["rotation"]) }
        : placement;
    });
  };

  const front = sidePlacements(sheet.frontSlots, sheet.front);
  const back = sidePlacements(sheet.backSlots, sheet.back);

  // Outer corners of the whole block, plus a horizontal-only tick on each
  // internal row boundary so a guillotine cut has something to line up with.
  // `dy` points AWAY from the block, the same convention the classic spread uses
  // and the one both consumers implement: `drawCropMarks` measures the room to
  // the sheet edge from the sign, and the preview draws upward for dy > 0. These
  // four marks used to carry the opposite sign, so every vertical arm ran 5 mm
  // into the artwork instead of out into the margin — on a block that filled the
  // sheet, the only marks that survived were the four lines printed inside the
  // trim. With the sign corrected, `fitMarkRun` skips the arm when there is no
  // room rather than drawing it inwards.
  const cropMarks: CropMarkGeometry[] = [
    { x: originX, y: originY + blockH, dx: -1, dy: 1 },
    { x: originX + blockW, y: originY + blockH, dx: 1, dy: 1 },
    { x: originX, y: originY, dx: -1, dy: -1 },
    { x: originX + blockW, y: originY, dx: 1, dy: -1 },
  ];
  /*
   * Each internal row boundary gets ONE short tick in the left margin and one in
   * the right margin — never a rule across the block, which would print over the
   * artwork. `dy: 0` means "horizontal only": there is no trim edge to run toward
   * on this axis, so both `drawCropMarks` and the preview must skip the vertical
   * arm here.
   */
  for (let r = 1; r < rows; r++) {
    const y = originY + r * bookSize.height;
    cropMarks.push({ x: originX, y, dx: -1, dy: 0 }, { x: originX + blockW, y, dx: 1, dy: 0 });
  }

  return {
    paper,
    front: { left: front[0], right: front[1] ?? front[0] },
    back: { left: back[0], right: back[1] ?? back[0] },
    frontSlots: front,
    backSlots: back,
    cropMarks,
    block: rect(originX, originY, blockW, blockH),
    cropGapMm: CROP_GAP_MM,
    cropLengthMm: CROP_LENGTH_MM,
    foldX: originX + blockW / 2,
    grid,
  };
}

/** Below this a "mark" is a stub nobody can trim against: skip it instead. */
export const MIN_MARK_SPAN_PT = 4;

/** Full mark, a shortened one, or nothing at all — in the room that is available. */
export type MarkRoom = "full" | "short" | "none";

/**
 * What a crop mark can do with `roomMm` of clear space between the trim edge and
 * the edge of the sheet. Mirrors `fitMarkRun` exactly, so a warning built from it
 * describes what the renderer will really do instead of guessing.
 */
export function markRoomFor(roomMm: number): MarkRoom {
  const fullPt = mmToPt(CROP_GAP_MM + CROP_LENGTH_MM);
  const run = fitMarkRun(Math.max(0, roomMm) * (72 / 25.4), mmToPt(CROP_GAP_MM), mmToPt(CROP_LENGTH_MM));
  if (!run) return "none";
  // `fitMarkRun` always leaves 1 pt of slack, so an exact fit still comes back a
  // hair short. Only call it "short" when the mark loses a tenth of its length:
  // a warning about 0.35 mm would be noise nobody acts on.
  return run.spanPt < fullPt * 0.9 ? "short" : "full";
}

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
  /** Grid the plan was built for (defaults to the 2x1 spread). */
  grid?: GridSpec;
}): ImpositionValidation {
  const { pages, sheets, sheetCount, signatureSheetCounts, paddedTotal, paper, bookSize, bleedMm, gutterMm, safeAreaMm, marks, binding, creep } = params;
  const grid = params.grid ?? PAIR_GRID;
  const slotsPerSide = slotCount(grid);
  const multiUp = slotsPerSide > 2;
  const errors: string[] = [];
  const warnings: string[] = [];
  const deepestSignature = Math.max(1, ...Object.values(signatureSheetCounts ?? { 1: sheetCount }));
  const maxCreep = binding === "perfect-binding" || !creep
    ? 0
    : computeCreepShiftMm(1, deepestSignature, creep.paperThicknessMm, creep.mode, creep.manualAmountMm);
  const baseRequired = requiredSheetSize(bookSize, Math.max(0, bleedMm), gutterMm, binding, marks, grid);
  const requiredSheet = { ...baseRequired, width: baseRequired.width + maxCreep * 2 };

  if (!validPositiveSize(paper)) errors.push("Ukuran kertas tidak valid.");
  if (!validPositiveSize(bookSize)) errors.push("Ukuran buku/trim tidak valid.");
  // Each physical sheet fills slotsPerSide * 2 pages: booklet/saddle/signature
  // by folding, perfect binding by duplexing the back side.
  const expectedSheets = Math.ceil(paddedTotal / (slotsPerSide * 2));
  if (sheetCount !== expectedSheets && pages.length > 0) {
    errors.push("Jumlah sheet imposition tidak konsisten dengan padding binding.");
  }

  const seen = new Map<number, number>();
  for (const sheet of sheets) {
    const sides = [
      ...(sheet.frontSlots ?? [sheet.front.left, sheet.front.right]),
      ...(sheet.backSlots ?? [sheet.back.left, sheet.back.right]),
    ];
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

  /*
   * A denser sheet is cut along the page edges, so a block that fills the sheet
   * is legitimate; `drawCropMarks` skips any mark that has no room. Report what
   * the sheet cannot show instead of refusing the layout.
   */
  if (multiUp && marks.showCropMarks) {
    /*
     * Report the outcome per axis, not "marks will be skipped".
     *
     * The old message claimed every mark would be dropped whenever the block plus
     * mark room did not fit the sheet. That was never true — the marks were still
     * drawn, only inwards — so it promised a clean sheet that the export did not
     * deliver. Now that the arms point outward, the honest statement is which
     * side has no room to draw on, and that the sheet edge itself is the cut line
     * there.
     */
    const gridGutter = binding === "perfect-binding" ? Math.max(0, gutterMm) : 0;
    const blockW = bookSize.width * Math.max(1, grid.cols) + gridGutter * (Math.max(1, grid.cols) - 1);
    const blockH = bookSize.height * Math.max(1, grid.rows);
    const sideRoom = Math.max(0, (paper.width - blockW) / 2);
    const topRoom = Math.max(0, (paper.height - blockH) / 2);
    const sides = markRoomFor(sideRoom);
    const ends = markRoomFor(topRoom);
    const needMm = (CROP_GAP_MM + CROP_LENGTH_MM).toFixed(1);

    if (sides === "none" || ends === "none") {
      const missing: string[] = [];
      if (sides === "none") missing.push(`kiri-kanan ${sideRoom.toFixed(1)} mm`);
      if (ends === "none") missing.push(`atas-bawah ${topRoom.toFixed(1)} mm`);
      warnings.push(
        `Crop marks tidak dapat ditampilkan pada grid ${grid.cols}×${grid.rows}: ruang di luar blok cetak hanya ${missing.join(" dan ")} (butuh ${needMm} mm). Blok sudah menyentuh tepi kertas, jadi tepi kertas itu sendiri yang menjadi acuan potong pada sisi tersebut.`
      );
    } else if (sides === "short" || ends === "short") {
      warnings.push(
        `Crop marks diperpendek agar tetap di dalam kertas: ruang di luar blok ${Math.min(sideRoom, topRoom).toFixed(1)} mm, panjang penuh butuh ${needMm} mm.`
      );
    }
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
