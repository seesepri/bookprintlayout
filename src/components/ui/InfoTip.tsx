import { Info } from "lucide-react";

/**
 * A one-line label plus the detail that used to be a paragraph of body text.
 *
 * The panels had grown explanations that ran three sentences long and pushed
 * the actual controls off the fold. Shortening them would have thrown away
 * information a print operator genuinely needs — folding rules, what head-to-head
 * means, why the estimate is an estimate — so the detail moved behind this
 * affordance instead: always one keystroke away, never in the way.
 *
 * Pure CSS: hover for a mouse, focus-within for keyboard and touch. No state, no
 * portal, no behaviour to keep in sync with the app.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label ? `Detail: ${label}` : "Detail"}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-slate-500 dark:hover:text-slate-300"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 w-60 max-w-[70vw] rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-slate-600 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      >
        {text}
      </span>
    </span>
  );
}
