import { useMemo } from "react";
import { useProject } from "../../../state/ProjectContext";
import type { BindingType, Orientation } from "../../../types";
import { PanelSection, Select, NumberField } from "./PanelShell";
import { computeSignatureRanges, padToMultiple } from "../../../lib/imposition";
import { resolvePrintPlan } from "../../../lib/plan";
import { InfoTip } from "../../ui/InfoTip";

/**
 * Short labels only. The explanation that used to sit under each option lives
 * behind the info affordance, so the choice itself is what the eye lands on.
 */
const BINDINGS: { key: BindingType; label: string; desc: string }[] = [
  { key: "booklet", label: "Booklet", desc: "Dilipat jadi satu buku." },
  { key: "saddle-stitch", label: "Saddle Stitch", desc: "Staples di tengah lipatan." },
  { key: "perfect-binding", label: "Perfect Binding", desc: "Lem panas, tanpa lipatan." },
  { key: "signature", label: "Signature", desc: "Dibagi beberapa signature." },
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
    <div className="settings-panel flex h-auto max-h-[46vh] w-full shrink-0 flex-col overflow-y-auto border-t border-slate-200 bg-white md:h-full md:max-h-none md:w-[320px] md:border-l md:border-t-0 lg:w-[340px]">
      <PanelSection title="Jenis Binding">
        <div className="space-y-2">
          {BINDINGS.map((b) => (
            <button
              key={b.key}
              onClick={() => dispatch({ type: "SET_BINDING", binding: b.key })}
              className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition ${
                state.binding === b.key
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500/20"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="text-[13px] font-semibold text-slate-800">{b.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{b.desc}</div>
            </button>
          ))}
        </div>
      </PanelSection>

      {state.binding === "signature" && (
        <PanelSection title="Ukuran Signature">
          <div className="flex flex-wrap gap-1.5">
            {SIGNATURE_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => dispatch({ type: "SET_SIGNATURE_SIZE", size: n })}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  state.signatureSize === n
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <NumberField
            label="Custom"
            value={state.signatureSize}
            range={{ min: 4, max: 200 }}
            onCommit={(size) => dispatch({ type: "SET_SIGNATURE_SIZE", size })}
          />
        </PanelSection>
      )}

      <PanelSection title="Ringkasan">
        <dl className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <Row label="Halaman" value={String(totalRaw)} />
          <Row label="Per Lembar" value={`${neededMultiple} (${layout.grid.cols}×${layout.grid.rows})`} />
          <Row label="Halaman Kosong" value={String(blanks)} />
          <Row label="Setelah Padding" value={String(padded)} />
        </dl>
        {blanks > 0 && (
          <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600">
            <span>
              Ditambah {blanks} halaman kosong agar pas kelipatan {neededMultiple}
              {signatureNote}.
            </span>
            <InfoTip
              label="padding"
              text="Padding bersifat virtual: engine tetap mem-padding kalau Anda tidak menambahkannya. Tombol di halaman Pages hanya membuat halaman kosongnya nyata, untuk file yang harus genap."
            />
          </div>
        )}

        {state.binding === "signature" && signatureRanges.length > 0 && (
          <div className="space-y-1.5">
            {signatureRanges.map((sig) => (
              <div
                key={sig.index}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 text-[11px]"
              >
                <span className="font-semibold text-slate-600">Signature {sig.index}</span>
                <span className="text-slate-400">
                  Hal. {sig.startPage}–{sig.endPage}
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Orientasi Kertas">
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
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
