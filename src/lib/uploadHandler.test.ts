import { describe, expect, it, vi } from "vitest";

/**
 * `pdfRender` needs pdf.js and a real canvas; the restore path only needs to be
 * asked which source page it renders, so the module is stubbed and the calls are
 * recorded.
 */
const requested: number[] = [];
vi.mock("./pdfRender", () => ({
  openPdfForRender: async () => ({ doc: {}, numPages: 10, destroy: async () => {} }),
  readPageExtent: async () => ({ widthPt: 420, heightPt: 595 }),
  renderPageThumbnail: async (_handle: unknown, pageNumber: number) => {
    requested.push(pageNumber);
    return { dataUrl: `data:${pageNumber}`, widthPt: 420, heightPt: 595 };
  },
}));

const { looksLikePdf, rebuildThumbnails } = await import("./uploadHandler");
const { PDF_MIME, pageOf, pngMime } = {
  PDF_MIME: "application/pdf",
  pngMime: "image/png",
  pageOf: (originalIndex: number | null) => ({
    id: `p-${originalIndex}`,
    originalIndex,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 420,
    heightPt: 595,
  }),
};

describe("rebuildThumbnails", () => {
  it("renders the source page each slot still points at, not its position", async () => {
    requested.length = 0;
    // The user dragged page 3 to the front: position 0 -> source 2, position 1 -> source 0.
    const pages = [
      { ...pageOf(2), thumbnail: undefined },
      { ...pageOf(0), thumbnail: undefined },
      { ...pageOf(1), thumbnail: undefined },
    ];
    const out = await rebuildThumbnails(new Uint8Array([1, 2, 3]), pages);

    expect(requested).toEqual([3, 1, 2]);
    expect(out.map((p) => p.thumbnail)).toEqual(["data:3", "data:1", "data:2"]);
  });

  it("skips blanks and leaves them without an image", async () => {
    requested.length = 0;
    const blank = { ...pageOf(null), id: "blank", isBlank: true, thumbnail: undefined };
    const out = await rebuildThumbnails(new Uint8Array([1, 2, 3]), [blank, { ...pageOf(1), thumbnail: undefined }]);

    expect(requested).toEqual([2]);
    expect(out[0].thumbnail).toBeUndefined();
    expect(out[1].thumbnail).toBe("data:2");
  });

  it("skips a slot whose source page no longer exists instead of failing the resume", async () => {
    requested.length = 0;
    const pages = [{ ...pageOf(99), thumbnail: undefined }, { ...pageOf(0), thumbnail: undefined }];
    const out = await rebuildThumbnails(new Uint8Array([1, 2, 3]), pages);

    expect(requested).toEqual([1]);
    expect(out[0].thumbnail).toBeUndefined();
    expect(out[1].thumbnail).toBe("data:1");
  });
});

describe("looksLikePdf", () => {
  it("accepts a real PDF MIME", () => {
    expect(looksLikePdf({ type: PDF_MIME, name: "buku.pdf" })).toBe(true);
    expect(looksLikePdf({ type: "Application/PDF", name: "no-extension" })).toBe(true);
  });

  it("accepts an empty or generic MIME when the name says .pdf", () => {
    // What Android share sheets and several file managers actually hand over.
    expect(looksLikePdf({ type: "", name: "Buku Final.PDF" })).toBe(true);
    expect(looksLikePdf({ type: "application/octet-stream", name: "buku.pdf" })).toBe(true);
    expect(looksLikePdf({ name: "buku.pdf" })).toBe(true);
  });

  it("refuses a type that names another family, and a non-PDF name", () => {
    expect(looksLikePdf({ type: pngMime, name: "cover.png" })).toBe(false);
    expect(looksLikePdf({ type: "", name: "catatan.docx" })).toBe(false);
    expect(looksLikePdf({ type: "", name: "pdf" })).toBe(false);
  });
});
