import { ReactNode, useEffect, useRef, useState } from "react";
import { commitDraftNumber, NumberFieldRange } from "../../../lib/numberField";

/** `title` accepts nodes so a section heading can carry its own ⓘ. */
export function PanelSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-5 py-5 last:border-b-0">
      <h3 className="mb-3.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function NumberInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const handleWheel: React.WheelEventHandler<HTMLInputElement> = (event) => {
    // Do not let mouse-wheel interactions accidentally change numeric settings.
    // Browser zoom is also blocked at the workspace level when Ctrl/Cmd is held.
    event.currentTarget.blur();
    props.onWheel?.(event);
  };

  return (
    <input
      type="number"
      {...props}
      onWheel={handleWheel}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
    />
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label}
    </label>
  );
}

/**
 * Numeric text field that keeps a local draft while focused.
 *
 * `NumberInput` is a controlled `type="number"` box: every keystroke went
 * through the range clamp, so a field with a minimum of 20 could never be typed
 * into from scratch (2 -> 20, then 201...). Same styling, but the draft text
 * survives until the value is actually committed on blur or Enter.
 */
export function NumberBox({
  value,
  onCommit,
  range,
  ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => void;
  range: NumberFieldRange;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  // Keep the shown value in sync when state changes from the outside (preset
  // switch, "Pakai" button, project restore) but never fight the user's cursor.
  useEffect(() => {
    if (draft !== null && ref.current && document.activeElement !== ref.current) setDraft(null);
  }, [value, draft]);

  const shown = draft ?? String(value);
  const commit = (live: boolean) => {
    const next = commitDraftNumber(draft ?? "", { ...range, current: value, live });
    if (next !== null && next !== value) onCommit(next);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={shown}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = commitDraftNumber(e.target.value, { ...range, current: value, live: true });
        if (next !== null && next !== value) onCommit(next);
      }}
      onBlur={() => {
        commit(false);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(false);
          setDraft(null);
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      onWheel={(e) => {
        // Do not let mouse-wheel interactions accidentally change numeric settings.
        e.currentTarget.blur();
      }}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
    />
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  range,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
  range: NumberFieldRange;
}) {
  return (
    <Field label={label}>
      <NumberBox value={value} onCommit={onCommit} range={range} ariaLabel={label} />
    </Field>
  );
}
