import type { BindingDirection, BindingType, Orientation, SizeMM } from "../types";
import type { ImpositionPlan } from "./imposition";
import { planImposition } from "./imposition";
import type { GridChoice, PagesPerSideSetting } from "./nup";
import { resolveSheet } from "./previewHelpers";

/**
 * One resolution of "what will this book actually print on", for everything
 * outside the exporter.
 *
 * The page browser, the layout panel and the print panel all need the same
 * numbers the engine will use: how many pages sit on one sheet, how many blanks
 * are missing, how many sheets deep the deepest signature is. Each of them used
 * to call `planImposition` on its own — without `slotsPerSide`, which the engine
 * *does* pass — so on a 4-up sheet the UI promised "Lengkapi 2 halaman" for a
 * book that still needed 6, and reported a creep estimate for a sheet count the
 * engine never produced.
 *
 * Going through this function instead means the preview, the panels and the PDF
 * cannot disagree about the plan.
 */
export interface PrintPlanInput {
  pageCount: number;
  /** Paper as picked by the user, before orientation. */
  paperSize: SizeMM;
  bookSize: SizeMM;
  orientation: Orientation;
  binding: BindingType;
  bindingDirection?: BindingDirection;
  signatureSize?: number;
  pagesPerSide?: PagesPerSideSetting;
  bleedMm: number;
  gutterMm: number;
  showCropMarks: boolean;
}

export interface PrintPlan {
  /** Paper after orientation. */
  paper: SizeMM;
  layout: GridChoice;
  plan: ImpositionPlan;
  /** Book pages carried by one physical sheet, both sides included. */
  pagesPerSheet: number;
  /** Blank pages the plan is short by (virtual padding, unless materialised). */
  blanks: number;
}

export function resolvePrintPlan(input: PrintPlanInput): PrintPlan {
  const { paper, layout } = resolveSheet({
    paper: input.paperSize,
    orientation: input.orientation,
    bookSize: input.bookSize,
    binding: input.binding,
    setting: input.pagesPerSide,
    bleedMm: input.bleedMm,
    gutterMm: input.gutterMm,
    showCropMarks: input.showCropMarks,
  });

  const pageCount = Math.max(0, Math.floor(input.pageCount));
  const plan = planImposition(pageCount, input.binding, input.signatureSize ?? 16, input.bindingDirection ?? "left", {
    slotsPerSide: layout.slotsPerSide,
  });

  return {
    paper,
    layout,
    plan,
    pagesPerSheet: layout.slotsPerSide * 2,
    blanks: Math.max(0, plan.paddedTotal - pageCount),
  };
}
