export type ViewKey =
  | "upload"
  | "pages"
  | "layout"
  | "book"
  | "print"
  | "cover"
  | "creep"
  | "export";

export type BindingType =
  | "booklet"
  | "saddle-stitch"
  | "perfect-binding"
  | "signature";

export type PresetBookSize = "A4" | "A5" | "A6" | "B5" | "Letter" | "Custom";
export type PresetPaperSize = "A4" | "A3" | "A2" | "F4" | "SRA3" | "Custom";
export type Orientation = "portrait" | "landscape" | "auto";
export type BindingDirection = "left" | "right";
export type ViewMode = "spread" | "grid";
export type ExportFormat =
  /** Full output: marks, bleed, both sides. */
  | "print-ready"
  /** Small approval file: no marks, artwork fitted to trim instead of bleed. */
  | "preview"
  /** One PDF page per signature, separated by labelled divider pages. */
  | "per-signature"
;

export interface SizeMM {
  width: number;
  height: number;
}

export interface PageInfo {
  id: string;
  originalIndex: number | null; // null => blank page
  rotation: 0 | 90 | 180 | 270;
  isBlank: boolean;
  thumbnail?: string;
  widthPt: number;
  heightPt: number;
}

/**
 * Where a page number sits inside the trim box, named from the reader's view of
 * the page. Rotation is applied later, so a slot printed upside down still puts
 * the number at that slot's own top-left.
 */
export type PageNumberPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface PageNumberSettings {
  enabled: boolean;
  position: PageNumberPosition;
  /** Point size of the printed number. */
  fontSizePt: number;
  /**
   * Printed on the first page of the document. Blank pages still consume a
   * number — that is what keeps the folio aligned with the physical sheet — but
   * they never print one.
   */
  startAt: number;
}

export interface CreepSettings {
  paperThicknessMm: number;
  mode: "auto" | "manual";
  manualAmountMm: number;
}

export interface CoverSettings {
  frontFile?: File | null;
  backFile?: File | null;
  spineFile?: File | null;
  spineWidthMm: number;
  bleedMm: number;
  includeCropMarks: boolean;
}

/** Boolean toggles inside `ExportSettings`, safe to patch by key. */
export type BooleanExportKey = "includeCropMarks" | "includeBleed" | "includeRegistration" | "compress";

export interface ExportSettings {
  format: ExportFormat;
  includeCropMarks: boolean;
  includeBleed: boolean;
  includeRegistration: boolean;
  compress: boolean;
}

export interface MarksSettings {
  showCropMarks: boolean;
  showBleedArea: boolean;
  showSafeArea: boolean;
  showFoldMarks: boolean;
  showCenterLine: boolean;
  showRegistrationMarks: boolean;
}

export interface ProjectFileMeta {
  fileName: string;
  fileSizeBytes: number;
  pageCount: number;
  pageSizePt: { width: number; height: number };
  status: "empty" | "analyzing" | "ready" | "error";
}

export interface SheetSide {
  left: number | null; // page number (1-indexed), null = blank
  right: number | null;
}

export interface Sheet {
  index: number;
  signature: number;
  front: SheetSide;
  back: SheetSide;
  /** Pages per side when the sheet is denser than a two-page spread. */
  slotsPerSide?: number;
  /**
   * Row-major page numbers for a multi-up side, index 0 = top-left. Only set
   * when slotsPerSide > 2; `front`/`back` keep the first two slots so every
   * existing reader of a spread still sees the same thing.
   */
  frontSlots?: (number | null)[];
  backSlots?: (number | null)[];
}

export interface SignatureRange {
  index: number;
  startPage: number;
  endPage: number;
  pageCount: number;
}
