import { Orientation, SizeMM } from "../types";

export const MM_PER_PT = 25.4 / 72;
export const PT_PER_MM = 72 / 25.4;

export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const ptToMm = (pt: number) => pt * MM_PER_PT;

export const BOOK_SIZE_PRESETS: Record<string, SizeMM> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  B5: { width: 176, height: 250 },
  Letter: { width: 215.9, height: 279.4 },
};

export const PAPER_SIZE_PRESETS: Record<string, SizeMM> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  F4: { width: 215, height: 330 },
  SRA3: { width: 320, height: 450 },
};

export function applyOrientation(size: SizeMM, orientation: Orientation, referenceAspectWide = true): SizeMM {
  const isLandscapeShape = size.width > size.height;
  if (orientation === "portrait") {
    return isLandscapeShape ? { width: size.height, height: size.width } : size;
  }
  if (orientation === "landscape") {
    return isLandscapeShape ? size : { width: size.height, height: size.width };
  }
  // auto
  if (referenceAspectWide && !isLandscapeShape) {
    return { width: size.height, height: size.width };
  }
  return size;
}

/**
 * Parses a numeric form field into a safe value.
 *
 * `Number("")` is 0 and `Number("abc")` is NaN, and both used to flow straight
 * into project state (a cleared "Width" field silently became a 0 mm book).
 * Everything downstream reads geometry in mm, so every numeric input goes
 * through here instead.
 */
export function readNumberInput(
  raw: string | number | null | undefined,
  options: { fallback: number; min?: number; max?: number; step?: number }
): number {
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  const min = Number.isFinite(options.min) ? (options.min as number) : -Infinity;
  const max = Number.isFinite(options.max) ? (options.max as number) : Infinity;
  if (!Number.isFinite(parsed)) return clamp(options.fallback, min, max);
  return clamp(parsed, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to the nearest allowed step so mm inputs never drift past 0.01 mm. */
export function snapToStep(value: number, step = 0.1): number {
  return Number((Math.round(value / step) * step).toFixed(6));
}

