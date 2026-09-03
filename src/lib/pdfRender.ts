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
}

export async function openPdfForRender(bytes: Uint8Array): Promise<PdfDocHandle> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
  const doc = await loadingTask.promise;
  return { doc, numPages: doc.numPages };
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
