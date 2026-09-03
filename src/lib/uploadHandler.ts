import { PageInfo, ProjectFileMeta } from "../types";
import { openPdfForRender, renderPageThumbnail } from "./pdfRender";

export async function analyzePdf(
  file: File
): Promise<{ bytes: Uint8Array; meta: ProjectFileMeta; pages: PageInfo[] }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  const handle = await openPdfForRender(bytes);
  const numPages = handle.numPages;

  const pages: PageInfo[] = [];
  // Every source page must have a PageInfo entry so imposition/export never
  // silently truncates a document larger than 400 pages.
  for (let i = 1; i <= numPages; i++) {
    const { dataUrl, widthPt, heightPt } = await renderPageThumbnail(handle, i, 220);
    pages.push({
      id: `p-${i}`,
      originalIndex: i - 1,
      rotation: 0,
      isBlank: false,
      thumbnail: dataUrl,
      widthPt,
      heightPt,
    });
  }

  const first = pages[0];
  const meta: ProjectFileMeta = {
    fileName: file.name,
    fileSizeBytes: file.size,
    pageCount: numPages,
    pageSizePt: first ? { width: first.widthPt, height: first.heightPt } : { width: 0, height: 0 },
    status: "ready",
  };

  return { bytes, meta, pages };
}

export async function handleFileUpload(file: File, dispatch: (action: any) => void) {
  dispatch({ type: "SET_GENERATING", value: true });
  try {
    const { bytes, meta, pages } = await analyzePdf(file);
    dispatch({ type: "SET_SOURCE", bytes, meta, pages });
  } finally {
    dispatch({ type: "SET_GENERATING", value: false });
  }
}
