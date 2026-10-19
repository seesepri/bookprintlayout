import { useMemo } from "react";
import { useProject } from "../../../state/ProjectContext";
import { BindingType, Orientation } from "../../../types";
import { PanelSection, Select, NumberField } from "./PanelShell";
import { computeSignatureRanges, padToMultiple } from "../../../lib/imposition";
import { resolvePrintPlan } from "../../../lib/plan";
import { Info } from "lucide-react";

const BINDINGS: { key: BindingType; label: string; desc: string }[] = [
  { key: "booklet", label: "Booklet", desc: "Halaman dicetak bolak-balik lalu dilipat menjadi satu buku sederhana." },
  { key: "saddle-stitch", label: "Saddle Stitch", desc: "Penjilidan staples di tengah, mendukung multi-sheet & signature." },
  { key: "perfect-binding", label: "Perfect Binding", desc: "Penjilidan lem panas, halaman disusun tunggal tanpa lipatan." },
  { key: "signature", label: "Signature Imposition", desc: "Buku dibagi menjadi beberapa signature (grup halaman)." },
];

const SIGNATURE_OPTIONS = [4, 8, 16, 24, 32];

export default function LayoutSettingsPanel() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const totalRaw = state.pages.length;
  // "Multiple of 4" was only ever true for a spread. A 4-up sheet is folded (or
  // duplexed) twice, so it carries eight pages and the summary has to say so —
  // otherwise the panel advertises a smaller padding than the file needs.
  const { layout, plan, pagesPerSheet: neededMultiple, blanks } = useMemo(
    () =>
      resolvePrintPlan({
        pageCount: totalRaw,
        paperSize: activePaperSize,
        bookSize: activeBookSize,
        orientation: state.orientation,
        binding: state.binding,
        bindingDirection: state.bindingDirection,
        signatureSize: state.signatureSize,
        pagesPerSide: state.pagesPerSide,
        bleedMm: state.bleedMm,
        gutterMm: state.gutterMm,
        showCropMarks: state.marks.showCropMarks,
      }),
    [
      totalRaw,
      activePaperSize,
      activeBookSize,
      state.orientation,
      state.binding,
      state.bindingDirection,
      state.signatureSize,
      state.pagesPerSide,
      state.bleedMm,
      state.gutterMm,
      state.marks.showCropMarks,
    ]
  );
  const padded = plan.paddedTotal;
  const signatureNote = state.binding === "signature" ? " per signature" : "";

  const signatureRanges =
    state.binding === "signature" ? computeSignatureRanges(padToMultiple(totalRaw, 4), state.signatureSize) : [];

  return (
    <div className="settings-panel flex max-h-[46vh] h-auto w-full shrink-0 flex-col overflow-y-auto border-t md:max-h-none md:h-full md:w-[300px] lg:w-[340px] xl:w-[360px] md:border-t-0 md:border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <PanelSection title="Jenis Layout / Binding">
        <div className="space-y-2">
          {BINDINGS.map((b) => (
            <button
              key={b.key}
              onClick={() => dispatch({ type: "SET_BINDING", binding: b.key })}
              className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                state.binding === b.key
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
              }`}
            >
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{b.label}</div>
              <div className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{b.desc}</div>
            </button>
          ))}
        </div>
      </PanelSection>

      {state.binding === "signature" && (
        <PanelSection title="Signature Size">
          <div className="flex flex-wrap gap-2">
            {SIGNATURE_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => dispatch({ type: "SET_SIGNATURE_SIZE", size: n })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  state.signatureSize === n
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {n} Pages
              </button>
            ))}
          </div>
          <NumberField
            label="Custom Signature Size"
            value={state.signatureSize}
            range={{ min: 4, max: 200 }}
            onCommit={(size) => dispatch({ type: "SET_SIGNATURE_SIZE", size })}
          />
        </PanelSection>
      )}

      <PanelSection title="Ringkasan Imposition">
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <Row label="Total Halaman Asli" value={String(totalRaw)} />
          <Row label="Halaman per Lembar" value={`${neededMultiple} halaman (${layout.grid.cols}×${layout.grid.rows})`} />
          <Row label="Blank Ditambahkan" value={String(blanks)} />
          <Row label="Total Setelah Padding" value={String(padded)} />
        </div>
        {blanks > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Sistem otomatis menambahkan {blanks} halaman kosong agar jumlah halaman pas kelipatan {neededMultiple}
            {signatureNote}.
          </div>
        )}

        {state.binding === "signature" && signatureRanges.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {signatureRanges.map((sig) => (
              <div
                key={sig.index}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
              >
                <span className="font-semibold text-slate-600 dark:text-slate-300">Signature {sig.index}</span>
                <span className="text-slate-400">
                  Page {sig.startPage}–{sig.endPage}
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Paper Orientation">
        <Select
          value={state.orientation}
          onChange={(e) => dispatch({ type: "SET_ORIENTATION", orientation: e.target.value as Orientation })}
        >
          <option value="auto">Auto</option>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </Select>
      </PanelSection>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}
