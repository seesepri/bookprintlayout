import { PageInfo, ProjectFileMeta } from "../types";
import { openPdfForRender, readPageExtent, renderPageThumbnail } from "./pdfRender";

/** Uploads above this size are rejected before any parsing starts. */
export const MAX_PDF_BYTES = 150 * 1024 * 1024;

/**
 * Thumbnails are rasterised for at most this many pages. Every page still gets
 * a PageInfo entry, so a 900-page book is imposed and exported in full — only
 * the page-browser previews of the tail are omitted (PagesView renders a
 * numbered placeholder when `thumbnail` is absent).
 */
export const MAX_THUMBNAIL_PAGES = 400;

/** Hand the main thread back to the browser every N pages so the tab stays alive. */
const YIELD_EVERY = 8;

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

export type AnalyzeProgress = (donePages: number, totalPages: number) => void;

export async function analyzePdf(
  file: File,
  onProgress?: AnalyzeProgress
): Promise<{ bytes: Uint8Array; meta: ProjectFileMeta; pages: PageInfo[] }> {
  if (file.size > MAX_PDF_BYTES) {
    const limitMb = Math.round(MAX_PDF_BYTES / 1024 / 1024);
    throw new Error(`Ukuran PDF melebihi ${limitMb} MB. Pecah dokumennya dulu, lalu upload ulang.`);
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  const handle = await openPdfForRender(bytes);
  try {
    const numPages = handle.numPages;
    const pages: PageInfo[] = [];

    // Every source page must have a PageInfo entry so imposition/export never
    // silently truncates a document larger than MAX_THUMBNAIL_PAGES. Page
    // geometry is cheap (viewport only), so this pass runs for all pages.
    for (let i = 1; i <= numPages; i++) {
      const { widthPt, heightPt } = await readPageExtent(handle, i);
      pages.push({
        id: `p-${i}`,
        originalIndex: i - 1,
        rotation: 0,
        isBlank: false,
        widthPt,
        heightPt,
      });
      if (i % YIELD_EVERY === 0) {
        onProgress?.(i, numPages);
        await yieldToBrowser();
      }
    }

    // Rasterising is the expensive part, so it is capped and interleaved with
    // yields. Thumbnails are additive UI sugar — nothing downstream needs them.
    const thumbCount = Math.min(numPages, MAX_THUMBNAIL_PAGES);
    for (let i = 1; i <= thumbCount; i++) {
      const { dataUrl } = await renderPageThumbnail(handle, i, 220);
      pages[i - 1] = { ...pages[i - 1], thumbnail: dataUrl };
      if (i % YIELD_EVERY === 0) {
        onProgress?.(i, numPages);
        await yieldToBrowser();
      }
    }
    onProgress?.(numPages, numPages);

    const first = pages[0];
    const meta: ProjectFileMeta = {
      fileName: file.name,
      fileSizeBytes: file.size,
      pageCount: numPages,
      pageSizePt: first ? { width: first.widthPt, height: first.heightPt } : { width: 0, height: 0 },
      status: "ready",
    };

    return { bytes, meta, pages };
  } finally {
    // The pdf.js document is only needed for analysis; export works from
    // sourceBytes + pdf-lib. Without this the worker stays alive for every
    // upload in the session.
    await handle.destroy();
  }
}

/**
 * Re-rasterises thumbnails for pages restored from disk. The stored page
 * list keeps ids, order, rotation and blanks intact — only the preview images
 * are regenerated, with the same cap and yields as a fresh upload.
 */
export async function rebuildThumbnails(bytes: Uint8Array, pages: PageInfo[]): Promise<PageInfo[]> {
  if (!bytes.length) return pages;
  const handle = await openPdfForRender(bytes);
  try {
    const next = [...pages];
    const thumbCount = Math.min(next.length, MAX_THUMBNAIL_PAGES);
    for (let i = 1; i <= thumbCount; i++) {
      if (next[i - 1].isBlank || next[i - 1].originalIndex === null) continue;
      const { dataUrl } = await renderPageThumbnail(handle, i, 220);
      next[i - 1] = { ...next[i - 1], thumbnail: dataUrl };
      if (i % YIELD_EVERY === 0) await yieldToBrowser();
    }
    return next;
  } catch {
    // A source file that no longer parses must not block the rest of the
    // layout: the project (sizes, order, settings) is still usable.
    return pages;
  } finally {
    await handle.destroy();
  }
}

export async function handleFileUpload(
  file: File,
  dispatch: (action: { type: "SET_GENERATING"; value: boolean } | { type: "SET_SOURCE"; bytes: Uint8Array; meta: ProjectFileMeta; pages: PageInfo[] }) => void,
  onProgress?: AnalyzeProgress
) {
  dispatch({ type: "SET_GENERATING", value: true });
  try {
    const { bytes, meta, pages } = await analyzePdf(file, onProgress);
    dispatch({ type: "SET_SOURCE", bytes, meta, pages });
  } catch (e) {
    dispatch({
      type: "SET_SOURCE",
      bytes: new Uint8Array(0),
      meta: {
        fileName: file.name,
        fileSizeBytes: file.size,
        pageCount: 0,
        pageSizePt: { width: 0, height: 0 },
        status: "error",
      },
      pages: [],
    });
    throw e;
  } finally {
    dispatch({ type: "SET_GENERATING", value: false });
  }
}
