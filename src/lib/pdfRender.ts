import * as pdfjsLib from "pdfjs-dist";
// Import the worker source as a raw string so it gets inlined at build time
// (robust even when the app is bundled into a single HTML file), then turn
// it into a Blob URL at runtime for the actual Worker instance.
// eslint-disable-next-line import/no-unresolved
import workerSource from "pdfjs-dist/build/pdf.worker.mjs?raw";

const workerBlobUrl = URL.createObjectURL(
  new Blob([workerSource], { type: "text/javascript" })
);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;

export interface PdfDocHandle {
  doc: pdfjsLib.PDFDocumentProxy;
  numPages: number;
  /**
   * Releases the document and its worker. pdf.js 6.x removed
   * `PDFDocumentProxy.destroy()`; the loading task owns the lifecycle now,
   * so every caller that opens a document must destroy it when done.
   */
  destroy: () => Promise<void>;
}

/**
 * SECURITY: `pdfjs-dist` is pinned to >= 6.2.108 on purpose.
 *
 * GHSA-hq66-cqwq-w95j / CVE-2026-16633: on the whole 5.x line (>= 5.6.83,
 * < 6.2.108) a crafted PDF could run attacker-controlled JavaScript in the
 * page origin because `enableScripting` defaulted to true and no CSP guarded
 * `script-src`. This app feeds *user-uploaded* PDFs straight into `render()`,
 * so that path was directly reachable.
 *
 * 6.2.108 removes `PDFScriptingManager` from the core build entirely — the
 * capability is gone rather than switchable, which is why there is no
 * `enableScripting: false` option to pass here (it is no longer part of
 * `DocumentInitParameters`, and passing it would be a type error).
 *
 * If this dependency is ever downgraded, the mitigation must come back as
 * `enableScripting: false` plus a CSP with a restrictive `script-src`.
 */
export async function openPdfForRender(bytes: Uint8Array): Promise<PdfDocHandle> {
  // bytes.slice(0): pdf.js neuters/transfers the buffer it receives, while the
  // caller still needs the untouched original for pdf-lib during export.
  // enableXfa:false keeps AcroForm XFA (a second, rarely-needed parser) off.
  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(0),
    enableXfa: false,
  });
  const doc = await loadingTask.promise;
  return {
    doc,
    numPages: doc.numPages,
    destroy: () => loadingTask.destroy(),
  };
}

/**
 * Cheap metadata read (viewport only, no raster). Used to size every page of a
 * document before any thumbnail is rendered, so large uploads stay responsive.
 */
export async function readPageExtent(
  handle: PdfDocHandle,
  pageNumber: number
): Promise<{ widthPt: number; heightPt: number }> {
  const page = await handle.doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  return { widthPt: viewport.width, heightPt: viewport.height };
}

export async function renderPageThumbnail(
  handle: PdfDocHandle,
  pageNumber: number,
  targetWidth = 240
): Promise<{ dataUrl: string; widthPt: number; heightPt: number }> {
  const page = await handle.doc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    widthPt: baseViewport.width,
    heightPt: baseViewport.height,
  };
}
