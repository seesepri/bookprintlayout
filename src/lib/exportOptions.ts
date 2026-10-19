import { ImpositionValidation, validateImposition } from "./geometry";
import { ImpositionPlan, planImposition } from "./imposition";
import { orientedPaperSize, resolveSheetLayout } from "./previewHelpers";
import type { GridReason, GridSpec } from "./nup";
import { MarksSettings, SizeMM } from "../types";
import type { ProjectState } from "../state/ProjectContext";

/**
 * The single place that turns "what the user asked for" (print-settings toggles
 * + export settings) into "what the engine gets".
 *
 * This used to be written out twice in ExportView — once for `validateImposition`
 * and once for `buildImpositionPdf` — and the two copies had already drifted
 * (safe area counted in one, not the other; registration marks hijacking the
 * center line). Keeping one resolver means the file that is validated is the
 * file that is built.
 */
export interface ResolvedExportOptions {
  plan: ImpositionPlan;
  paper: SizeMM;
  bleedMm: number;
  safeAreaMm: number;
  gutterMm: number;
  marks: MarksSettings;
  compress: boolean;
  validation: ImpositionValidation;
  /** Pages-per-side grid the sheets are laid out on. */
  grid: GridSpec;
  slotsPerSide: number;
  layoutReason: GridReason;
  /** 4-up folded sheets: rotate the top band head-to-head. */
  quadHeadToHead: boolean;
}

export function resolveExportOptions(
  state: ProjectState,
  bookSize: SizeMM,
  paperSize: SizeMM
): ResolvedExportOptions {
  const paper = orientedPaperSize(paperSize, state.orientation, bookSize);

  const isPreview = state.exportSettings.format === "preview";
  const drawMarks = !isPreview;

  const marks: MarksSettings = {
    showCropMarks: drawMarks && state.marks.showCropMarks && state.exportSettings.includeCropMarks,
    showBleedArea: drawMarks && state.marks.showBleedArea && state.exportSettings.includeBleed,
    showSafeArea: drawMarks && state.marks.showSafeArea,
    showFoldMarks: drawMarks && state.marks.showFoldMarks,
    // Independent of registration marks on purpose: it is its own guide with
    // its own toggle.
    showCenterLine: drawMarks && state.marks.showCenterLine,
    showRegistrationMarks:
      drawMarks && state.marks.showRegistrationMarks && state.exportSettings.includeRegistration,
  };

  const bleedMm = state.exportSettings.includeBleed && !isPreview ? state.bleedMm : 0;
  const safeAreaMm = state.safeAreaMm;
  const gutterMm = state.gutterMm;

  // The grid is chosen from the *print-level* bleed and mark toggles, so the
  // preview and this export always agree, and an export that drops a guide can
  // only ever become more conservative.
  const layout = resolveSheetLayout({
    paper,
    bookSize,
    binding: state.binding,
    setting: state.pagesPerSide,
    bleedMm: state.bleedMm,
    gutterMm: state.gutterMm,
    showCropMarks: state.marks.showCropMarks,
  });
  const plan = planImposition(state.pages.length, state.binding, state.signatureSize, state.bindingDirection, {
    slotsPerSide: layout.slotsPerSide,
  });

  const validation = validateImposition({
    grid: layout.grid,
    pages: state.pages,
    sheets: plan.sheets,
    sheetCount: plan.sheets.length,
    signatureSheetCounts: plan.signatureSheetCounts,
    paddedTotal: plan.paddedTotal,
    paper,
    bookSize,
    bleedMm,
    gutterMm,
    safeAreaMm,
    marks,
    binding: state.binding,
    creep: state.creep,
  });

  return {
    plan,
    paper,
    bleedMm,
    safeAreaMm,
    gutterMm,
    marks,
    compress: state.exportSettings.compress,
    validation,
    grid: layout.grid,
    slotsPerSide: layout.slotsPerSide,
    layoutReason: layout.reason,
    quadHeadToHead: state.quadHeadToHead,
  };
}

/** Filename suffix per export format, so the three modes are tellable apart. */
export const EXPORT_SUFFIX: Record<string, string> = {
  "print-ready": "imposed",
  preview: "preview",
  "per-signature": "per-signature",
};
