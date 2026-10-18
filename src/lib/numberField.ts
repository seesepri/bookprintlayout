import { readNumberInput, snapToStep } from "./paperSizes";

export interface NumberFieldRange {
  min?: number;
  max?: number;
  /** Rounding grid. `undefined` means "store exactly what was typed". */
  step?: number;
}

/**
 * Decide what a numeric text field should do with a keystroke.
 *
 * While the field is focused the user is *mid-word*: "2" is not the value 2 mm,
 * it is the first digit of 210. Clamping every keystroke (the old behaviour)
 * made the custom size fields unusable — a minimum of 20 turned "2" into "20"
 * and every later digit landed behind it, so 210 became 2010 and 15 became 20.
 * Only the committed value is clamped; the draft text is shown as typed.
 */
export function commitDraftNumber(
  raw: string,
  opts: NumberFieldRange & { current: number; live: boolean }
): number | null {
  const text = String(raw ?? "").trim();
  if (text === "") return opts.live ? null : opts.current;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return null;

  if (opts.live) {
    // Out-of-range while typing is not a mistake yet, so leave state untouched.
    if (Number.isFinite(opts.min) && parsed < (opts.min as number)) return null;
    if (Number.isFinite(opts.max) && parsed > (opts.max as number)) return null;
    return opts.step === undefined ? parsed : snapToStep(parsed, opts.step);
  }
  const safe = readNumberInput(parsed, { fallback: opts.current, min: opts.min, max: opts.max });
  return opts.step === undefined ? safe : snapToStep(safe, opts.step);
}

/** True when the typed text is complete and inside the allowed range. */
export function isDraftAccepted(raw: string, opts: NumberFieldRange): boolean {
  const text = String(raw ?? "").trim();
  if (text === "") return false;
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return false;
  if (Number.isFinite(opts.min) && parsed < (opts.min as number)) return false;
  if (Number.isFinite(opts.max) && parsed > (opts.max as number)) return false;
  return true;
}
