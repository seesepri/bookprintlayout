import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, rgb } from "pdf-lib";
import { buildCoverPdf, fitCoverArtwork } from "./pdfEngine";

const BOOK = { width: 148, height: 210 };
const mm = (v: number) => (v * 72) / 25.4;
const BLEED_MM = 3;
const BLEED_PT = mm(BLEED_MM);

/** A one-page donor PDF of the given trim size, in millimetres. */
async function donor(widthMm: number, heightMm: number, pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([mm(widthMm), mm(heightMm)]);
    // A blank page has no content stream and pdf-lib refuses to embed one.
    page.drawRectangle({ x: 0, y: 0, width: mm(widthMm), height: mm(heightMm), color: rgb(0.9, 0.9, 0.9) });
  }
  return doc.save();
}

/** Edges a back-cover slot gets: bleed outside, none towards the spine. */
const BACK_EDGES = { left: BLEED_PT, right: 0, top: BLEED_PT, bottom: BLEED_PT };

describe("fitCoverArtwork", () => {
  it("hangs bleed-sized artwork over the trim edges instead of shrinking it to trim", () => {
    // 148 + 3 mm bleed on the outside only: the inner edge is the fold, where a
    // bleed would run over the spine.
    const fit = fitCoverArtwork({
      artworkW: mm(151),
      artworkH: mm(216),
      slotX: mm(20),
      slotY: mm(20),
      trimW: mm(148),
      trimH: mm(210),
      bleed: BACK_EDGES,
    });

    expect(fit.usesBleed).toBe(true);
    expect(fit.scale).toBeCloseTo(1, 6);
    // Positioned against the expanded box: 3 mm left and bottom of the trim box.
    expect(fit.x).toBeCloseTo(mm(20 - BLEED_MM), 6);
    expect(fit.y).toBeCloseTo(mm(20 - BLEED_MM), 6);
  });

  it("centres trim-sized artwork on the trim box", () => {
    const fit = fitCoverArtwork({
      artworkW: mm(148),
      artworkH: mm(210),
      slotX: mm(20),
      slotY: mm(20),
      trimW: mm(148),
      trimH: mm(210),
      bleed: BACK_EDGES,
    });

    expect(fit.usesBleed).toBe(false);
    expect(fit.scale).toBeCloseTo(1, 6);
    expect(fit.x).toBeCloseTo(mm(20), 6);
    expect(fit.y).toBeCloseTo(mm(20), 6);
  });

  it("keeps a full-bleed artwork covering the outer bleed instead of cropping it", () => {
    // 148 + 3 mm bleed on all four sides, the common way a cover is exported.
    // The inner 3 mm cannot be honoured (it is the fold), so the artwork lands
    // at 98 % and still covers trim + outer bleed exactly.
    const fit = fitCoverArtwork({
      artworkW: mm(154),
      artworkH: mm(216),
      slotX: mm(20),
      slotY: mm(20),
      trimW: mm(148),
      trimH: mm(210),
      bleed: BACK_EDGES,
    });

    expect(fit.usesBleed).toBe(true);
    expect(fit.scale).toBeCloseTo(151 / 154, 6);
    expect(fit.scale).toBeGreaterThan(0.97);
    // Drawn width equals the slot's bleed box, so no white edge survives.
    expect(fit.scale * mm(154)).toBeCloseTo(mm(151), 6);
  });

  it("keeps the aspect ratio and stays inside the box for off-size artwork", () => {
    const fit = fitCoverArtwork({
      artworkW: mm(297),
      artworkH: mm(210),
      slotX: 0,
      slotY: 0,
      trimW: mm(148),
      trimH: mm(210),
      bleed: { left: 0, right: 0, top: 0, bottom: 0 },
    });

    expect(fit.usesBleed).toBe(true);
    expect(fit.scale).toBeCloseTo(148 / 297, 6);
    expect(fit.scale > 0).toBe(true);
    expect(fit.x).toBeCloseTo(0, 6);
    // 210 * (148/297) is shorter than the trim height, so it is vertically centred.
    expect(fit.y).toBeCloseTo((mm(210) - mm(210) * (148 / 297)) / 2, 6);
  });
});

describe("buildCoverPdf notes", () => {
  it("reports that only page 1 of a multi-page slot is used", async () => {
    const { notes } = await buildCoverPdf({
      bookSize: BOOK,
      spineWidthMm: 12,
      bleedMm: 0,
      frontBytes: await donor(148, 210, 2),
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ slot: "front", kind: "extra-pages" });
    expect(notes[0].message).toContain("2 halaman");
  });

  it("warns when the artwork carries no bleed for a sheet that has bleed", async () => {
    const { notes } = await buildCoverPdf({
      bookSize: BOOK,
      spineWidthMm: 12,
      bleedMm: BLEED_MM,
      frontBytes: await donor(148, 210),
    });

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ slot: "front", kind: "no-bleed" });
  });

  it("says nothing when the artwork is exactly what the slot asked for", async () => {
    const { notes } = await buildCoverPdf({
      bookSize: BOOK,
      spineWidthMm: 12,
      bleedMm: BLEED_MM,
      frontBytes: await donor(148 + BLEED_MM * 2, 210 + BLEED_MM * 2),
    });

    expect(notes).toEqual([]);
  });
});

describe("buildCoverPdf sheet", () => {
  it("bleed-sized artwork is embedded and keeps the sheet size it always had", async () => {
    const { bytes } = await buildCoverPdf({
      bookSize: BOOK,
      spineWidthMm: 12,
      bleedMm: BLEED_MM,
      includeCropMarks: false,
      frontBytes: await donor(148 + BLEED_MM * 2, 210 + BLEED_MM * 2),
    });

    const doc = await PDFDocument.load(bytes);
    // The sheet itself is unchanged by the fitting rule: trim x2 + spine + bleed.
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(mm(148 * 2 + 12 + BLEED_MM * 2), 1);
    expect(height).toBeCloseTo(mm(210 + BLEED_MM * 2), 1);
    expect(doc.getPageCount()).toBe(1);
    // The artwork really is on the sheet: it is referenced as a form XObject.
    const xObjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xObjects).toBeTruthy();
    expect(xObjects!.keys().length).toBe(1);
  });
});
