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

export function formatMm(v: number) {
  return `${v.toFixed(1)} mm`;
}

export function bytesToSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
