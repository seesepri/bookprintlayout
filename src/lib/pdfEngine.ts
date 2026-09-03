import { PDFDocument, PDFPage, PDFEmbeddedPage, rgb, degrees } from "pdf-lib";
import { BindingDirection, BindingType, CreepSettings, MarksSettings, PageInfo, SizeMM } from "../types";
import { mmToPt } from "./paperSizes";
import { planImposition } from "./imposition";
import { buildSheetGeometry, PagePlacement } from "./geometry";

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
  includeRegistration?: boolean;
  creep?: CreepSettings;
}

const LINE_COLOR = rgb(0.1, 0.1, 0.1);
const SAFE_COLOR = rgb(0.2, 0.55, 0.95);
const BLEED_COLOR = rgb(0.9, 0.2, 0.25);
const FOLD_COLOR = rgb(0.45, 0.35, 0.85);

async function embedAllPages(outDoc: PDFDocument, sourceBytes: Uint8Array) {
  const srcDoc = await PDFDocument.load(sourceBytes);
  return outDoc.embedPdf(srcDoc, srcDoc.getPageIndices());
}

function drawCropMarks(page: PDFPage, marks: { x: number; y: number; dx: -1 | 1; dy: -1 | 1 }[], gapPt: number, lenPt: number) {
  for (const mark of marks) {
    const x = mmToPt(mark.x);
    const y = mmToPt(mark.y);
    const dx = mark.dx;
    const dy = mark.dy;
    page.drawLine({ start: { x: x + dx * gapPt, y }, end: { x: x + dx * (gapPt + lenPt), y }, thickness: 0.6, color: LINE_COLOR });
    page.drawLine({ start: { x, y: y + dy * gapPt }, end: { x, y: y + dy * (gapPt + lenPt) }, thickness: 0.6, color: LINE_COLOR });
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
  const rotation = ((info.rotation % 360) + 360) % 360;
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

export async function buildImpositionPdf(params: BuildImpositionParams): Promise<Uint8Array> {
  const {
    sourceBytes,
    pages,
    binding,
    bindingDirection = "left",
    signatureSize,
    bookSize,
    paperSize,
    bleedMm,
    safeAreaMm,
    gutterMm,
    marks,
    creep,
  } = params;

  const outDoc = await PDFDocument.create();
  const embeddedPages = await embedAllPages(outDoc, sourceBytes);
  const plan = planImposition(pages.length, binding, signatureSize, bindingDirection);


  const resolvePage = (pageNumber: number | null) => {
    if (pageNumber === null || pageNumber < 1 || pageNumber > pages.length) return null;
    const info = pages[pageNumber - 1];
    if (!info || info.isBlank || info.originalIndex === null) return null;
    const embedded = embeddedPages[info.originalIndex];
    return embedded ? { embedded, info } : null;
  };

  const sheetWidthPt = mmToPt(paperSize.width);
  const sheetHeightPt = mmToPt(paperSize.height);
  const isFolded = binding !== "perfect-binding";

  plan.sheets.forEach((sheet) => {
    const geometry = buildSheetGeometry({
          sheet,
          paper: paperSize,
          bookSize,
                bleedMm,
          gutterMm,
          safeAreaMm,
          binding,
          bindingDirection,
          pages,
          marks,
          creep,
          sheetCount: plan.sheets.length,
        });
    if (!geometry) return;

    const frontPage = outDoc.addPage([sheetWidthPt, sheetHeightPt]);
    drawPlacement(frontPage, geometry.front.left, resolvePage(sheet.front.left), marks);
    drawPlacement(frontPage, geometry.front.right, resolvePage(sheet.front.right), marks);
    if (marks.showCropMarks) drawCropMarks(frontPage, geometry.cropMarks, mmToPt(2), mmToPt(5));
    if (marks.showFoldMarks && isFolded) {
      frontPage.drawLine({
        start: { x: mmToPt(geometry.foldX), y: 0 },
        end: { x: mmToPt(geometry.foldX), y: sheetHeightPt },
        thickness: 0.6,
        color: FOLD_COLOR,
        dashArray: [6, 4],
      });
    }

    if (isFolded) {
      const backPage = outDoc.addPage([sheetWidthPt, sheetHeightPt]);
      drawPlacement(backPage, geometry.back.left, resolvePage(sheet.back.left), marks);
      drawPlacement(backPage, geometry.back.right, resolvePage(sheet.back.right), marks);
      if (marks.showCropMarks) drawCropMarks(backPage, geometry.cropMarks, mmToPt(2), mmToPt(5));
      if (marks.showFoldMarks) {
        backPage.drawLine({
          start: { x: mmToPt(geometry.foldX), y: 0 },
          end: { x: mmToPt(geometry.foldX), y: sheetHeightPt },
          thickness: 0.6,
          color: FOLD_COLOR,
          dashArray: [6, 4],
        });
      }
    }
  });

  return outDoc.save();
}

export interface BuildCoverParams {
  bookSize: SizeMM;
  spineWidthMm: number;
  bleedMm: number;
  frontBytes?: Uint8Array | null;
  backBytes?: Uint8Array | null;
  spineBytes?: Uint8Array | null;
  includeCropMarks?: boolean;
}

export async function buildCoverPdf(params: BuildCoverParams): Promise<Uint8Array> {
  const { bookSize, spineWidthMm, bleedMm, frontBytes, backBytes, spineBytes, includeCropMarks = true } = params;
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
    const gap = mmToPt(2);
    const len = mmToPt(5);
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

  return outDoc.save();
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export function bytesToBlob(bytes: Uint8Array, type = "application/pdf"): Blob {
  return new Blob([bytes as unknown as BlobPart], { type });
}
