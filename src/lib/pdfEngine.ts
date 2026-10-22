import {
  PDFDict,
  PDFDocument,
  PDFEmbeddedPage,
  PDFFont,
  PDFName,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import { BindingDirection, BindingType, CreepSettings, ExportFormat, MarksSettings, PageInfo, PageNumberPosition, PageNumberSettings, SizeMM, Sheet } from "../types";
import type { SignatureRange } from "../types";
import { mmToPt } from "./paperSizes";
import { ImpositionPlan, planImposition } from "./imposition";
import { GridSpec, PAIR_GRID, slotCount } from "./nup";
import { buildSheetGeometry, fitMarkRun, PagePlacement, SheetGeometry } from "./geometry";

export interface BuildImpositionParams {
  sourceBytes: Uint8Array;
  pages: PageInfo[];
  binding: BindingType;
  bindingDirection?: BindingDirection;
  signatureSize: number;
  bookSize: SizeMM;
  paperSize: SizeMM;
  bleedMm: number;
  safeAreaMm: number;
  gutterMm: number;
  marks: MarksSettings;
  /** Folio printing. Omitted means "no numbering", which is also the default. */
  pageNumbers?: PageNumberSettings;
  creep?: CreepSettings;
  /** Output profile. Defaults to the full print-ready sheet. */
  mode?: ExportFormat;
  /** Pages-per-side grid; 2x1 (default) is the classic side-by-side spread. */
  grid?: GridSpec;
  /** 4-up folded sheets: turn the top band head-to-head (default) or print it upright. */
  quadHeadToHead?: boolean;
  /** Object-stream compression on save. Defaults to true. */
  compress?: boolean;
}

const LINE_COLOR = rgb(0.1, 0.1, 0.1);
const SAFE_COLOR = rgb(0.2, 0.55, 0.95);
const BLEED_COLOR = rgb(0.9, 0.2, 0.25);
const FOLD_COLOR = rgb(0.45, 0.35, 0.85);
const CENTER_COLOR = rgb(0.35, 0.35, 0.35);

const CROP_GAP_MM = 2;
const CROP_LENGTH_MM = 5;

/**
 * Embed only the source pages the plan actually references. `pages` may hold
 * duplicates (fine — one embed, many draws) and the user may have deleted
 * source pages, which must not be carried into the output file.
 */
async function embedUsedPages(
  outDoc: PDFDocument,
  sourceBytes: Uint8Array,
  pages: PageInfo[]
): Promise<Map<number, PDFEmbeddedPage>> {
  const srcDoc = await PDFDocument.load(sourceBytes);
  const wanted = [
    ...new Set(
      pages
        .filter((p) => !p.isBlank && p.originalIndex !== null)
        .map((p) => p.originalIndex as number)
        .filter((idx) => idx >= 0 && idx < srcDoc.getPageCount())
    ),
  ].sort((a, b) => a - b);

  const embedded = wanted.length ? await outDoc.embedPdf(srcDoc, wanted) : [];
  return new Map(wanted.map((srcIndex, position) => [srcIndex, embedded[position]]));
}

/**
 * Clearance between the number and the edge it sits against.
 *
 * The number never comes closer than this to the trim, even with no safe area
 * configured: a folio 2 mm from the cut line is one guillotine wobble away from
 * being sliced off. Where a safe area is set and wider than this, the number
 * moves inside it instead — see `folioInsetMm`.
 */
const PAGE_NUMBER_MIN_INSET_MM = 8;
/** Extra clearance kept between the number and the safe-area line. */
const PAGE_NUMBER_SAFE_GAP_MM = 2;

/** Distance from the trim edge to the number for a given safe area. */
export function folioInsetMm(safeAreaMm: number): number {
  return Math.max(PAGE_NUMBER_MIN_INSET_MM, safeAreaMm + PAGE_NUMBER_SAFE_GAP_MM);
}
const PAGE_NUMBER_COLOR = rgb(0.15, 0.15, 0.15);

export interface PageNumberAnchor {
  x: number;
  y: number;
  /** Text rotation in degrees, matching the slot so the number reads upright. */
  rotate: number;
}

/**
 * Where to put one number inside a slot, in sheet points.
 *
 * The position is named from the page's own point of view ("top-left" is the
 * top-left of the artwork as the reader sees it), so the anchor is worked out in
 * the page's frame and then turned with the slot. Offsetting in sheet space
 * instead would drop the number into the bleed on every rotated slot.
 *
 * The turn happens in normalised coordinates, not points. A trim box is rarely
 * square — an A5 page in a portrait slot is 1:1.41 — and rotating a point about
 * the centre of a non-square box in points pushes corners outside the box. In
 * normalised space the box maps onto itself for every quarter turn; the cost is
 * that on 90°/270° slots the 8 mm inset is 8 mm along the *short* axis scaled by
 * the aspect ratio, which is still inside the trim and still looks deliberate.
 */
export function pageNumberAnchor({
  trim,
  position,
  rotation,
  fontSizePt,
  textWidthPt,
  safeAreaMm = 0,
}: {
  /**
   * Safe-area width as the sheet geometry applied it — the value that is drawn,
   * not the raw setting, because a hidden safe area is 0 there and must still
   * leave the minimum clearance.
   */
  safeAreaMm?: number;
  trim: { x: number; y: number; width: number; height: number };
  position: PageNumberPosition;
  rotation: number;
  fontSizePt: number;
  textWidthPt: number;
}): PageNumberAnchor {
  const x0 = mmToPt(trim.x);
  const y0 = mmToPt(trim.y);
  const w = mmToPt(trim.width);
  const h = mmToPt(trim.height);
  const inset = mmToPt(folioInsetMm(safeAreaMm));

  const [vertical, horizontal] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];

  // Normalised insets are measured against the axis each one will land on *after*
  // the turn. A quarter turn swaps x and y, so measuring both against the
  // unrotated box would shrink the physical clearance by the page's aspect ratio
  // (a 1:1.5 page would keep only two thirds of it). Swapping the denominators on
  // 90°/270° is what makes `inset` mean the same number of millimetres on every
  // slot.
  const quarterTurn = rotation === 90 || rotation === 270;
  const localW = quarterTurn ? h : w;
  const localH = quarterTurn ? w : h;

  // 0..1 across the page, measured from its left and bottom edges.
  let u = inset / localW;
  if (horizontal === "center") u = (localW - textWidthPt) / 2 / localW;
  else if (horizontal === "right") u = (localW - inset - textWidthPt) / localW;

  // Baseline, not box top: a top number sits `inset` below the trim edge.
  const v = vertical === "bottom" ? inset / localH : (localH - inset - fontSizePt * 0.72) / localH;

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const du = u - 0.5;
  const dv = v - 0.5;

  return {
    x: x0 + (0.5 + du * cos - dv * sin) * w,
    y: y0 + (0.5 + du * sin + dv * cos) * h,
    rotate: rotation,
  };
}

/**
 * Crop marks are only useful if the RIP can see them. Each axis is shortened to
 * the room between the trim edge and the edge of the physical sheet, and skipped
 * entirely when even that would be a stub. `validateImposition` already rejects
 * undersized paper, so this is the safety net for anything calling the engine
 * directly (tests, future exporters, the per-signature splitter).
 *
 * Exported because "no mark lands off-page" is worth a direct test.
 */
export function drawCropMarks(
  page: PDFPage,
  marks: { x: number; y: number; dx: -1 | 1; dy: -1 | 0 | 1 }[],
  gapPt: number,
  lenPt: number
) {
  const { width: pageW, height: pageH } = page.getSize();
  for (const mark of marks) {
    const x = mmToPt(mark.x);
    const y = mmToPt(mark.y);
    const runX = fitMarkRun(mark.dx < 0 ? x : pageW - x, gapPt, lenPt);
    // dy === 0 marks are cut-line ticks on an internal grid boundary: there is
    // no trim edge to run toward, so only the horizontal tick is drawn.
    const runY = mark.dy === 0 ? null : fitMarkRun(mark.dy < 0 ? y : pageH - y, gapPt, lenPt);
    if (runX) {
      page.drawLine({ start: { x: x + mark.dx * runX.gapPt, y }, end: { x: x + mark.dx * runX.spanPt, y }, thickness: 0.6, color: LINE_COLOR });
    }
    if (runY) {
      page.drawLine({ start: { x, y: y + mark.dy * runY.gapPt }, end: { x, y: y + mark.dy * runY.spanPt }, thickness: 0.6, color: LINE_COLOR });
    }
  }
}

/**
 * Printer's registration targets: a crosshair inside a circle, one near each
 * corner of the sheet, sitting inside whatever margin the layout leaves over.
 */
export function drawRegistrationMarks(page: PDFPage, sheetWPt: number, sheetHPt: number, insetPt: number) {
  const radius = Math.min(2.4, insetPt / 2);
  // The arms reach outward from the centre of the cross, so on paper with almost
  // no margin they would hang off the sheet: shorten them instead of clipping.
  const arm = Math.min(radius + 2.4, Math.max(0.5, insetPt - 0.5));
  const corners = [
    { x: insetPt, y: insetPt },
    { x: sheetWPt - insetPt, y: insetPt },
    { x: insetPt, y: sheetHPt - insetPt },
    { x: sheetWPt - insetPt, y: sheetHPt - insetPt },
  ];
  for (const c of corners) {
    page.drawCircle({ x: c.x, y: c.y, size: radius, borderColor: LINE_COLOR, borderWidth: 0.5 });
    page.drawLine({ start: { x: c.x - arm, y: c.y }, end: { x: c.x + arm, y: c.y }, thickness: 0.5, color: LINE_COLOR });
    page.drawLine({ start: { x: c.x, y: c.y - arm }, end: { x: c.x, y: c.y + arm }, thickness: 0.5, color: LINE_COLOR });
  }
}

function drawDashedRect(page: PDFPage, x0: number, y0: number, x1: number, y1: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    borderColor: color,
    borderWidth: 0.75,
    borderDashArray: [4, 3],
  });
}

function drawEmbeddedPage(page: PDFPage, embedded: PDFEmbeddedPage, info: PageInfo, placement: PagePlacement) {
  // Placement rotation, not just the page's: a head-to-head band arrives turned
  // 180° from the sheet geometry and the printed file has to follow it.
  const rotation = ((((placement.rotation ?? info.rotation) % 360) + 360) % 360);
  const sourceW = info.widthPt > 0 ? info.widthPt : embedded.width;
  const sourceH = info.heightPt > 0 ? info.heightPt : embedded.height;
  const rotatedW = rotation === 90 || rotation === 270 ? sourceH : sourceW;
  const rotatedH = rotation === 90 || rotation === 270 ? sourceW : sourceH;

  // If the source PDF is physically larger than the selected trim, preserve
  // that existing artwork/bleed by fitting it to the bleed box. Otherwise,
  // fit to trim. Scaling is always uniform; aspect ratio is never distorted.
  const sourceHasBleed = rotatedW > placement.trim.width * 72 / 25.4 + 0.25 || rotatedH > placement.trim.height * 72 / 25.4 + 0.25;
  const targetWPt = mmToPt(sourceHasBleed ? placement.bleed.width : placement.trim.width);
  const targetHPt = mmToPt(sourceHasBleed ? placement.bleed.height : placement.trim.height);
  const scale = Math.min(targetWPt / rotatedW, targetHPt / rotatedH);
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  const visualW = rotation === 90 || rotation === 270 ? drawH : drawW;
  const visualH = rotation === 90 || rotation === 270 ? drawW : drawH;
  const baseX = mmToPt(placement.trim.x + placement.trim.width / 2) - visualW / 2;
  const baseY = mmToPt(placement.trim.y + placement.trim.height / 2) - visualH / 2;

  let x = baseX;
  let y = baseY;
  if (rotation === 90) x += drawW;
  else if (rotation === 180) {
    x += drawW;
    y += drawH;
  } else if (rotation === 270) y += drawH;

  page.drawPage(embedded, {
    x,
    y,
    xScale: scale,
    yScale: scale,
    rotate: degrees(rotation),
  });
}

function drawPlacement(
  page: PDFPage,
  placement: PagePlacement,
  resolved: { embedded: PDFEmbeddedPage; info: PageInfo } | null,
  marks: MarksSettings,
  folio?: { settings: PageNumberSettings; font: PDFFont; safeAreaMm: number }
) {
  if (resolved) {
    drawEmbeddedPage(page, resolved.embedded, resolved.info, placement);
    // A blank page consumes its number but prints nothing, so the folio stays
    // aligned with the physical sheet without stamping an empty page.
    if (folio) drawPageNumber(page, placement, folio.settings, folio.font, folio.safeAreaMm);
  }

  if (marks.showBleedArea) {
    drawDashedRect(
      page,
      mmToPt(placement.bleed.x),
      mmToPt(placement.bleed.y),
      mmToPt(placement.bleed.x + placement.bleed.width),
      mmToPt(placement.bleed.y + placement.bleed.height),
      BLEED_COLOR
    );
  }
  if (marks.showSafeArea) {
    drawDashedRect(
      page,
      mmToPt(placement.safe.x),
      mmToPt(placement.safe.y),
      mmToPt(placement.safe.x + placement.safe.width),
      mmToPt(placement.safe.y + placement.safe.height),
      SAFE_COLOR
    );
  }
}

/**
 * Prints one folio number inside its slot. `placement.pageNumber` is the page's
 * position in the document (1-based), which is what the reader counts — not the
 * sheet number, which is meaningless once the book is folded and trimmed.
 */
function drawPageNumber(
  page: PDFPage,
  placement: PagePlacement,
  settings: PageNumberSettings,
  font: PDFFont,
  safeAreaMm: number
) {
  if (placement.pageNumber === null) return;
  const value = settings.startAt + (placement.pageNumber - 1);
  const text = String(value);
  const textWidthPt = font.widthOfTextAtSize(text, settings.fontSizePt);
  const anchor = pageNumberAnchor({
    trim: placement.trim,
    position: settings.position,
    rotation: placement.rotation ?? 0,
    fontSizePt: settings.fontSizePt,
    textWidthPt,
    safeAreaMm,
  });

  page.drawText(text, {
    x: anchor.x,
    y: anchor.y,
    size: settings.fontSizePt,
    font,
    color: PAGE_NUMBER_COLOR,
    rotate: degrees(anchor.rotate),
  });
}

function addDividerPage(
  outDoc: PDFDocument,
  size: [number, number],
  label: string,
  sublabel: string,
  font?: PDFFont
) {
  const page = outDoc.addPage(size);
  page.drawRectangle({ x: 0, y: 0, width: size[0], height: size[1], color: rgb(1, 1, 1) });
  if (!font) return page;
  const width = font.widthOfTextAtSize(label, 18);
  page.drawText(label, { x: (size[0] - width) / 2, y: size[1] / 2 + 6, size: 18, font, color: rgb(0.05, 0.05, 0.05) });
  const subWidth = font.widthOfTextAtSize(sublabel, 10);
  page.drawText(sublabel, { x: (size[0] - subWidth) / 2, y: size[1] / 2 - 14, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  return page;
}

/**
 * Tells a print driver how the job is meant to be produced:
 *  - DuplexFlipShortEdge: the back side of every sheet was laid out for a
 *    flip around the vertical (fold) axis. "Flip on long edge" would put pages
 *    behind the wrong partners and silently ruin the whole run.
 *  - PrintScaling None: never "fit to page" a prepress sheet.
 */
/**
 * Catalog-level print hints. Exported so split per-signature files can
 * carry the same duplex setting as the combined sheet.
 */
export function applyPrintIntent(outDoc: PDFDocument, duplex: boolean) {
  const prefs = PDFDict.withContext(outDoc.context);
  prefs.set(PDFName.of("PrintScaling"), PDFName.of("None"));
  if (duplex) prefs.set(PDFName.of("Duplex"), PDFName.of("DuplexFlipShortEdge"));
  outDoc.catalog.set(PDFName.of("ViewerPreferences"), prefs);
}

/** Exported for the signature splitter: it must count pages with exactly the
 * same rule the engine uses when it decides to skip a back side. */
export const sheetSideIsEmpty = (side: { left: number | null; right: number | null }) =>
  side.left === null && side.right === null;

export async function buildImpositionPdf(params: BuildImpositionParams): Promise<Uint8Array> {
  const {
    sourceBytes,
    pages,
    binding,
    bindingDirection = "left",
    signatureSize,
    bookSize,
    paperSize,
    safeAreaMm,
    gutterMm,
    marks,
    pageNumbers,
    creep,
    mode = "print-ready",
    compress = true,
    grid = PAIR_GRID,
    quadHeadToHead = true,
  } = params;
  const slotsPerSide = slotCount(grid);

  const isPreview = mode === "preview";
  const drawMarks = !isPreview;

  // Preview is an approval artifact: artwork is fitted to trim and no marks are
  // drawn, which keeps the file small enough to mail to a client.
  const bleedMm = isPreview ? 0 : params.bleedMm;
  const outputMarks: MarksSettings = {
    showCropMarks: drawMarks && marks.showCropMarks,
    showBleedArea: drawMarks && marks.showBleedArea,
    showSafeArea: drawMarks && marks.showSafeArea,
    showFoldMarks: drawMarks && marks.showFoldMarks,
    showCenterLine: drawMarks && marks.showCenterLine,
    showRegistrationMarks: drawMarks && marks.showRegistrationMarks,
  };

  // What the geometry actually insets by: a hidden safe area contributes nothing.
  // The folio uses the same number, so a number that looks clear on the canvas
  // cannot end up outside the safe area in the file.
  const effectiveSafeAreaMm = outputMarks.showSafeArea ? safeAreaMm : 0;

  const outDoc = await PDFDocument.create();
  outDoc.setProducer("BookPrint Layout");
  outDoc.setCreator("BookPrint Layout");
  const embeddedByIndex = await embedUsedPages(outDoc, sourceBytes, pages);
  const plan: ImpositionPlan = planImposition(pages.length, binding, signatureSize, bindingDirection, {
    slotsPerSide,
  });

  const resolvePage = (pageNumber: number | null) => {
    if (pageNumber === null || pageNumber < 1 || pageNumber > pages.length) return null;
    const info = pages[pageNumber - 1];
    if (!info || info.isBlank || info.originalIndex === null) return null;
    const embedded = embeddedByIndex.get(info.originalIndex);
    return embedded ? { embedded, info } : null;
  };

  const sheetWidthPt = mmToPt(paperSize.width);
  const sheetHeightPt = mmToPt(paperSize.height);
  const isFolded = binding !== "perfect-binding";
  const dividerFont = mode === "per-signature" ? await outDoc.embedFont(StandardFonts.Helvetica) : undefined;
  // Preview keeps the numbers: a folio is content, not a printer's mark, and an
  // approval file that hides page numbers is not what the client is signing off.
  const folio = pageNumbers?.enabled
    ? {
        settings: pageNumbers,
        font: await outDoc.embedFont(StandardFonts.Helvetica),
        safeAreaMm: effectiveSafeAreaMm,
      }
    : undefined;

  // Free margin around the imposed block, used to place printer's marks.
  const gridCols = Math.max(1, grid.cols);
  const gridRows = Math.max(1, grid.rows);
  const blockWidthMm =
    bookSize.width * gridCols + (binding === "perfect-binding" ? Math.max(0, gutterMm) : 0) * (gridCols - 1);
  const blockHeightMm = bookSize.height * gridRows;
  const sideMarginMm = Math.max(0, (paperSize.width - blockWidthMm) / 2);
  const topMarginMm = Math.max(0, (paperSize.height - blockHeightMm) / 2);
  const regInsetPt = Math.max(3, Math.min(mmToPt(5), Math.min(sideMarginMm, topMarginMm) * 72 / 25.4 - mmToPt(1)));

  const sidePages = (sheet: Sheet, which: "front" | "back"): (number | null)[] => {
    const slots = which === "front" ? sheet.frontSlots : sheet.backSlots;
    return slots && slots.length ? slots : [sheet[which].left, sheet[which].right];
  };

  const drawSide = (geometry: SheetGeometry, placements: PagePlacement[], pageNumbers: (number | null)[]) => {
    const page = outDoc.addPage([sheetWidthPt, sheetHeightPt]);
    placements.forEach((placement, index) => {
      drawPlacement(page, placement, resolvePage(pageNumbers[index] ?? null), outputMarks, folio);
    });

    // Row-boundary marks carry `dy: 0`: `drawCropMarks` already draws their
    // horizontal tick in each margin and skips the vertical arm.
    if (outputMarks.showCropMarks) drawCropMarks(page, geometry.cropMarks, mmToPt(CROP_GAP_MM), mmToPt(CROP_LENGTH_MM));
    if (outputMarks.showRegistrationMarks) drawRegistrationMarks(page, sheetWidthPt, sheetHeightPt, regInsetPt);
    if (outputMarks.showCenterLine) {
      page.drawLine({
        start: { x: sheetWidthPt / 2, y: 0 },
        end: { x: sheetWidthPt / 2, y: sheetHeightPt },
        thickness: 0.5,
        color: CENTER_COLOR,
        dashArray: [2, 2],
      });
    }
    // Denser sheets are mark-only; the classic spread keeps the fold guide.
    if (outputMarks.showFoldMarks && isFolded && !geometry.block) {
      page.drawLine({
        start: { x: mmToPt(geometry.foldX), y: 0 },
        end: { x: mmToPt(geometry.foldX), y: sheetHeightPt },
        thickness: 0.6,
        color: FOLD_COLOR,
        dashArray: [6, 4],
      });
    }
  };

  let previousSignature: number | null = null;
  for (const sheet of plan.sheets) {
    if (mode === "per-signature" && sheet.signature !== previousSignature) {
      previousSignature = sheet.signature;
      const range: SignatureRange | undefined = plan.signatures.find((s) => s.index === sheet.signature);
      const label = `Signature ${sheet.signature}`;
      const sub = range
        ? `pages ${range.startPage}-${range.endPage} · ${plan.signatureSheetCounts[sheet.signature] ?? 0} sheets`
        : "";
      addDividerPage(outDoc, [sheetWidthPt, sheetHeightPt], label, sub, dividerFont);
    }

    const geometry = buildSheetGeometry({
      sheet,
      paper: paperSize,
      bookSize,
      bleedMm,
      gutterMm,
      safeAreaMm: effectiveSafeAreaMm,
      binding,
      bindingDirection,
      pages,
      marks: outputMarks,
      creep,
      signatureSheetCount: plan.signatureSheetCounts[sheet.signature] ?? 1,
      grid,
      quadHeadToHead,
    });

    drawSide(geometry, geometry.frontSlots ?? [geometry.front.left, geometry.front.right], sidePages(sheet, "front"));

    // Booklet-style bindings always need the back side (it is the same folded
    // sheet). Perfect binding only when that side actually carries pages, so a
    // short run does not gain a blank sheet.
    const backPages = sidePages(sheet, "back");
    if (isFolded || backPages.some((n) => n !== null)) {
      drawSide(geometry, geometry.backSlots ?? [geometry.back.left, geometry.back.right], backPages);
    }
  }

  applyPrintIntent(outDoc, isFolded || plan.sheets.some((s) => !sheetSideIsEmpty(s.back)));

  return outDoc.save({ useObjectStreams: compress });
}

export interface BuildCoverParams {
  bookSize: SizeMM;
  spineWidthMm: number;
  bleedMm: number;
  frontBytes?: Uint8Array | null;
  backBytes?: Uint8Array | null;
  spineBytes?: Uint8Array | null;
  includeCropMarks?: boolean;
  compress?: boolean;
}

export type CoverSlot = "back" | "spine" | "front";

/**
 * Something about the supplied artwork the user has to know before sending the
 * file out. The cover path is the one place where a silent guess costs paper:
 * an ignored second page or an artwork that never had bleed both look like a
 * perfect preview and a ruined print run.
 */
export interface CoverNote {
  slot: CoverSlot;
  kind: "extra-pages" | "no-bleed";
  message: string;
}

export interface CoverBuildResult {
  bytes: Uint8Array;
  /** Empty when every slot was used exactly as supplied. */
  notes: CoverNote[];
}

/** Bleed allowed on each side of a slot; the middle edges have none. */
export interface CoverEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CoverFitInput {
  /** Artwork size in points, as embedded. */
  artworkW: number;
  artworkH: number;
  /** Trim box of this slot, in points, from the bottom-left of the sheet. */
  slotX: number;
  slotY: number;
  trimW: number;
  trimH: number;
  /** Bleed room available on each side of the slot, in points. */
  bleed: CoverEdges;
}

export interface CoverFit {
  x: number;
  y: number;
  /** Uniform scale, so the artwork aspect ratio is never changed. */
  scale: number;
  /** True when the artwork was placed against the bleed box instead of trim. */
  usesBleed: boolean;
}

/** Under this, a difference is rounding, not bleed. */
const COVER_BLEED_TOLERANCE_PT = 0.5;

/**
 * Where a cover slot's artwork goes, and how big.
 *
 * The rule mirrors the interior sheets: artwork that is larger than the trim
 * box is carrying its own bleed, so it is fitted to the *bleed* box and hung
 * over the trim edges; artwork that is trim-sized or smaller is fitted to the
 * trim box. Fitting everything to trim (the old behaviour) shrank a 148+3 mm
 * cover down to 148 mm and turned the designer's bleed into a white frame —
 * the exact opposite of what the "bleed otomatis" promise in the UI says.
 *
 * Exported because "artwork with bleed is never scaled down" is worth a direct
 * test, and because the pure maths is easier to trust than a content stream.
 */
export function fitCoverArtwork({ artworkW, artworkH, slotX, slotY, trimW, trimH, bleed }: CoverFitInput): CoverFit {
  const usesBleed = artworkW > trimW + COVER_BLEED_TOLERANCE_PT || artworkH > trimH + COVER_BLEED_TOLERANCE_PT;
  const boxW = usesBleed ? trimW + bleed.left + bleed.right : trimW;
  const boxH = usesBleed ? trimH + bleed.top + bleed.bottom : trimH;
  const scale = Math.min(boxW / artworkW, boxH / artworkH);
  const boxX = slotX - (usesBleed ? bleed.left : 0);
  const boxY = slotY - (usesBleed ? bleed.bottom : 0);
  return {
    x: boxX + (boxW - artworkW * scale) / 2,
    y: boxY + (boxH - artworkH * scale) / 2,
    scale,
    usesBleed,
  };
}

const COVER_SLOT_LABEL: Record<CoverSlot, string> = {
  back: "Back cover",
  spine: "Spine",
  front: "Front cover",
};

export async function buildCoverPdf(params: BuildCoverParams): Promise<CoverBuildResult> {
  const {
    bookSize,
    spineWidthMm,
    bleedMm,
    frontBytes,
    backBytes,
    spineBytes,
    includeCropMarks = true,
    compress = true,
  } = params;
  const outDoc = await PDFDocument.create();
  const notes: CoverNote[] = [];

  const bleedPt = mmToPt(bleedMm);
  const trimWPt = mmToPt(bookSize.width);
  const trimHPt = mmToPt(bookSize.height);
  const spinePt = mmToPt(spineWidthMm);

  const totalWidth = trimWPt * 2 + spinePt + bleedPt * 2;
  const totalHeight = trimHPt + bleedPt * 2;

  const page = outDoc.addPage([totalWidth, totalHeight]);
  page.drawRectangle({ x: 0, y: 0, width: totalWidth, height: totalHeight, color: rgb(1, 1, 1) });

  const backX0 = bleedPt;
  const spineX0 = backX0 + trimWPt;
  const frontX0 = spineX0 + spinePt;
  const y0 = bleedPt;

  // Bleed exists only on the outside of the whole cover: the edge a slot shares
  // with the spine is a fold, and hanging artwork over it would cover the
  // neighbouring panel.
  const edgesFor = (slot: CoverSlot): CoverEdges => ({
    left: slot === "back" ? bleedPt : 0,
    right: slot === "front" ? bleedPt : 0,
    top: bleedPt,
    bottom: bleedPt,
  });

  async function embedAndDraw(bytes: Uint8Array | null | undefined, slot: CoverSlot, x0: number, w: number) {
    if (!bytes) return;
    const donor = await PDFDocument.load(bytes);
    // The page picker does not exist yet, so page 1 is the slot's artwork. Say
    // so instead of dropping the rest of the file on the floor silently: a two
    // page cover PDF is a normal thing to upload.
    if (donor.getPageCount() > 1) {
      notes.push({
        slot,
        kind: "extra-pages",
        message: `${COVER_SLOT_LABEL[slot]}: PDF berisi ${donor.getPageCount()} halaman — hanya halaman 1 yang dipakai.`,
      });
    }
    const [embedded] = await outDoc.embedPdf(donor, [0]);
    const fit = fitCoverArtwork({
      artworkW: embedded.width,
      artworkH: embedded.height,
      slotX: x0,
      slotY: y0,
      trimW: w,
      trimH: trimHPt,
      bleed: edgesFor(slot),
    });

    if (!fit.usesBleed && bleedPt > 0) {
      notes.push({
        slot,
        kind: "no-bleed",
        message: `${COVER_SLOT_LABEL[slot]}: artwork tidak menyertakan bleed, jadi tepi ${bleedMm} mm akan berwarna putih. Tambahkan ${bleedMm} mm di tiap sisi lalu unggah ulang.`,
      });
    }

    page.drawPage(embedded, { x: fit.x, y: fit.y, xScale: fit.scale, yScale: fit.scale });
  }

  await embedAndDraw(backBytes, "back", backX0, trimWPt);
  await embedAndDraw(spineBytes, "spine", spineX0, spinePt);
  await embedAndDraw(frontBytes, "front", frontX0, trimWPt);

  // Guides
  page.drawLine({
    start: { x: spineX0, y: 0 },
    end: { x: spineX0, y: totalHeight },
    thickness: 0.6,
    color: FOLD_COLOR,
    dashArray: [5, 3],
  });
  page.drawLine({
    start: { x: frontX0, y: 0 },
    end: { x: frontX0, y: totalHeight },
    thickness: 0.6,
    color: FOLD_COLOR,
    dashArray: [5, 3],
  });
  drawDashedRect(page, bleedPt, bleedPt, totalWidth - bleedPt, totalHeight - bleedPt, BLEED_COLOR);

  if (includeCropMarks) {
    const trim = { x: bleedPt, y: bleedPt, width: trimWPt * 2 + spinePt, height: trimHPt };
    // Marks are drawn outside the trim box; with little or no bleed there is no
    // room, so they shrink to fit instead of falling off the page invisibly.
    const gap = Math.min(mmToPt(CROP_GAP_MM), Math.max(1.5, bleedPt - 1));
    const len = Math.min(mmToPt(CROP_LENGTH_MM), Math.max(3, gap * 2));
    const marks = [
      { x: trim.x, y: trim.y, dx: -1 as const, dy: -1 as const },
      { x: trim.x + trim.width, y: trim.y, dx: 1 as const, dy: -1 as const },
      { x: trim.x, y: trim.y + trim.height, dx: -1 as const, dy: 1 as const },
      { x: trim.x + trim.width, y: trim.y + trim.height, dx: 1 as const, dy: 1 as const },
    ];
    for (const mark of marks) {
      page.drawLine({ start: { x: mark.x + mark.dx * gap, y: mark.y }, end: { x: mark.x + mark.dx * (gap + len), y: mark.y }, thickness: 0.6, color: LINE_COLOR });
      page.drawLine({ start: { x: mark.x, y: mark.y + mark.dy * gap }, end: { x: mark.x, y: mark.y + mark.dy * (gap + len) }, thickness: 0.6, color: LINE_COLOR });
    }
  }

  applyPrintIntent(outDoc, false);

  return { bytes: await outDoc.save({ useObjectStreams: compress }), notes };
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export function bytesToBlob(bytes: Uint8Array, type = "application/pdf"): Blob {
  return new Blob([bytes as unknown as BlobPart], { type });
}
