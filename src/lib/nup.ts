import type { BindingType, SizeMM } from "../types";

/** How many book pages sit on one side of a sheet, as a grid. */
export interface GridSpec {
  cols: number;
  rows: number;
}

/** The classic spread: two pages side by side. Everything was built around this. */
export const PAIR_GRID: GridSpec = { cols: 2, rows: 1 };

/** Four pages in a square — what an A3 sheet of A5 pages wants to be. */
export const QUAD_GRID: GridSpec = { cols: 2, rows: 2 };

/** User intent for the layout density. */
export type PagesPerSideSetting = "auto" | 2 | 4;

export type GridReason = "quad" | "pair-fits-only" | "pair-folded" | "pair-forced" | "quad-forced";

export interface GridChoice {
  grid: GridSpec;
  slotsPerSide: number;
  reason: GridReason;
  /** True when a 2x2 grid would have fitted but was declined. */
  quadAvailable: boolean;
}

export interface GridRoom {
  bleedMm: number;
  gutterMm: number;
  /** Extra space crop marks need outside the trim block (0 when marks are off). */
  marksRoomMm: number;
}

const EPSILON = 0.01;

export function slotCount(grid: GridSpec): number {
  return Math.max(1, grid.cols) * Math.max(1, grid.rows);
}

/**
 * Only perfect binding is safe to densify automatically.
 *
 * A folded 4-up signature needs the top row printed head-to-head (rotated 180°)
 * plus a guillotine cut through the middle before it reads in order; arranging a
 * plain 2x2 grid under a booklet binding would silently produce a booklet whose
 * pages land in the wrong order. So folded bindings keep the spread they have
 * always had.
 */
export function isFoldedBinding(binding: BindingType): boolean {
  return binding !== "perfect-binding";
}

/** Sheet size a grid demands, including bleed and the room marks need. */
export function gridSheetSize(bookSize: SizeMM, grid: GridSpec, room: GridRoom): SizeMM {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  // The gutter belongs between the two columns: it is the binding allowance of a
  // spread, not a gap between stacked rows (each page keeps its own safe area).
  const gutterTotal = cols > 1 ? Math.max(0, room.gutterMm) * (cols - 1) : 0;
  return {
    width: bookSize.width * cols + gutterTotal + room.bleedMm * 2 + room.marksRoomMm * 2,
    height: bookSize.height * rows + room.bleedMm * 2 + room.marksRoomMm * 2,
  };
}

export function gridFits(paper: SizeMM, bookSize: SizeMM, grid: GridSpec, room: GridRoom): boolean {
  const need = gridSheetSize(bookSize, grid, room);
  return need.width <= paper.width + EPSILON && need.height <= paper.height + EPSILON;
}

/** How many whole book pages the sheet can carry on one side, as a 2-column grid. */
export function maxRowsThatFit(paper: SizeMM, bookSize: SizeMM, room: GridRoom): number {
  const usable = paper.height - room.bleedMm * 2 - room.marksRoomMm * 2;
  if (!(usable > 0) || !(bookSize.height > 0)) return 0;
  return Math.max(1, Math.floor(usable / bookSize.height + EPSILON));
}

/**
 * Pick the layout density.
 *
 * `auto` densifies only when the extra pages genuinely fit *and* the binding can
 * be re-imposed safely, so every project that fits today keeps today's output.
 */
export function chooseGrid(
  paper: SizeMM,
  bookSize: SizeMM,
  binding: BindingType,
  setting: PagesPerSideSetting = "auto",
  room: GridRoom = { bleedMm: 0, gutterMm: 0, marksRoomMm: 0 }
): GridChoice {
  const quadAvailable = !isFoldedBinding(binding) && gridFits(paper, bookSize, QUAD_GRID, room);
  const decider = (grid: GridSpec, reason: GridReason): GridChoice => ({
    grid,
    slotsPerSide: slotCount(grid),
    reason,
    quadAvailable,
  });

  if (isFoldedBinding(binding)) return decider(PAIR_GRID, "pair-folded");
  if (setting === 2) return decider(PAIR_GRID, "pair-forced");
  if (setting === 4) return decider(quadAvailable ? QUAD_GRID : PAIR_GRID, quadAvailable ? "quad-forced" : "pair-fits-only");
  return decider(quadAvailable ? QUAD_GRID : PAIR_GRID, quadAvailable ? "quad" : "pair-fits-only");
}

/**
 * Slot order inside a grid: row-major, index 0 = top-left.
 *
 * Sheet geometry is millimetres measured from the bottom-left corner (PDF space),
 * so the first visual row has to sit highest on the sheet.
 */
export function slotIndexFromPosition(grid: GridSpec, index: number): { col: number; row: number } {
  const cols = Math.max(1, grid.cols);
  return { col: index % cols, row: Math.floor(index / cols) };
}
