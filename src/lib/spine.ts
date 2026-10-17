/**
 * Spine-width estimate for a bound book, so "Cover → Spine Width" no longer
 * has to be measured by hand (or guessed) before a file can be sent out.
 *
 * A book of N pages is N/2 leaves; the stack height is the leaf count times
 * the caliper (single-sheet thickness) of the paper. Perfect binding compresses
 * the glued end, so real jobs usually land slightly *under* the raw stack —
 * `compress` models that. Saddle stitch needs no spine at all.
 *
 * This is an estimate for layout, not a substitute for a caliper reading on
 * the printer's own stock.
 */
export interface SpineEstimateInput {
  pageCount: number;
  paperThicknessMm: number;
  /** Fraction of the loose stack that survives gluing/trimming. 1 = no compression. */
  compress?: number;
}

export function leavesFor(pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return 0;
  // An odd final page is still a physical leaf, and it still has thickness.
  return Math.ceil(pageCount / 2);
}

export function estimateSpineWidthMm({
  pageCount,
  paperThicknessMm,
  compress = 1,
}: SpineEstimateInput): number {
  if (!Number.isFinite(paperThicknessMm) || paperThicknessMm <= 0) return 0;
  const factor = Number.isFinite(compress) ? Math.min(1, Math.max(0.5, compress)) : 1;
  const raw = leavesFor(pageCount) * paperThicknessMm * factor;
  // Printer spreads are quoted to 0.1 mm; finer precision is noise.
  return Math.round(raw * 10) / 10;
}
