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
}

export interface SignatureRange {
  index: number;
  startPage: number;
  endPage: number;
  pageCount: number;
}
