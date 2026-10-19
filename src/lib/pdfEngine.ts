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
import { BindingDirection, BindingType, CreepSettings, ExportFormat, MarksSettings, PageInfo, SizeMM, Sheet } from "../types";
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
const CUT_COLOR = rgb(0.55, 0.4, 0.1);
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
  marks: MarksSettings
) {
  if (resolved) drawEmbeddedPage(page, resolved.embedded, resolved.info, placement);

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
      drawPlacement(page, placement, resolvePage(pageNumbers[index] ?? null), outputMarks);
    });

    if (outputMarks.showCropMarks) drawCropMarks(page, geometry.cropMarks, mmToPt(CROP_GAP_MM), mmToPt(CROP_LENGTH_MM));
    // The sheet is guillotined along every internal row boundary, so the fold
    // line and the cut line must be tellable apart at a glance.
    for (const y of geometry.cutLines ?? []) {
      page.drawLine({
        start: { x: 0, y: mmToPt(y) },
        end: { x: sheetWidthPt, y: mmToPt(y) },
        thickness: 0.35,
        color: CUT_COLOR,
        dashArray: [4, 3],
      });
    }
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
    if (outputMarks.showFoldMarks && isFolded) {
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
      safeAreaMm: outputMarks.showSafeArea ? safeAreaMm : 0,
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

export async function buildCoverPdf(params: BuildCoverParams): Promise<Uint8Array> {
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

  async function embedAndDraw(bytes: Uint8Array | null | undefined, x0: number, w: number) {
    if (!bytes) return;
    const donor = await PDFDocument.load(bytes);
    const [embedded] = await outDoc.embedPdf(donor, [0]);
    const scale = Math.min(w / embedded.width, trimHPt / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;
    page.drawPage(embedded, {
      x: x0 + (w - drawW) / 2,
      y: y0 + (trimHPt - drawH) / 2,
      xScale: scale,
      yScale: scale,
    });
  }

  await embedAndDraw(backBytes, backX0, trimWPt);
  await embedAndDraw(spineBytes, spineX0, spinePt);
  await embedAndDraw(frontBytes, frontX0, trimWPt);

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

  return outDoc.save({ useObjectStreams: compress });
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export function bytesToBlob(bytes: Uint8Array, type = "application/pdf"): Blob {
  return new Blob([bytes as unknown as BlobPart], { type });
}
