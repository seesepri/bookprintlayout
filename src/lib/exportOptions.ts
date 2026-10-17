import { ImpositionValidation, validateImposition } from "./geometry";
import { ImpositionPlan, planImposition } from "./imposition";
import { orientedPaperSize } from "./previewHelpers";
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
}

export function resolveExportOptions(
  state: ProjectState,
  bookSize: SizeMM,
  paperSize: SizeMM
): ResolvedExportOptions {
  const plan = planImposition(state.pages.length, state.binding, state.signatureSize, state.bindingDirection);
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

  const validation = validateImposition({
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
  };
}

/** Filename suffix per export format, so the three modes are tellable apart. */
export const EXPORT_SUFFIX: Record<string, string> = {
  "print-ready": "imposed",
  preview: "preview",
  "per-signature": "per-signature",
};
