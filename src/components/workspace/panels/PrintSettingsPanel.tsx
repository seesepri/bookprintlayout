import { useMemo } from "react";
import { useProject } from "../../../state/ProjectContext";
import { PanelSection, Field, NumberField, Checkbox, Select } from "./PanelShell";
import { computeCreepShiftMm } from "../../../lib/imposition";
import { resolvePrintPlan } from "../../../lib/plan";
import { readNumberInput } from "../../../lib/paperSizes";
import { InfoTip } from "../../ui/InfoTip";

export default function PrintSettingsPanel() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();

  // Same plan the exporter builds. Calling `planImposition` without the
  // pages-per-side setting counted a 4-up sheet as two, which inflated both the
  // signature depth and the creep estimate shown here.
  const plan = useMemo(
    () =>
      resolvePrintPlan({
        pageCount: state.pages.length,
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
      state.pages.length,
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
  ).plan;
  // Creep is scoped to a single signature: the outermost sheet of the deepest
  // signature is the worst case, not the outermost sheet of the whole run.
  const deepestSignature = Math.max(1, ...Object.values(plan.signatureSheetCounts));
  const estimatedCreep = computeCreepShiftMm(1, deepestSignature, state.creep.paperThicknessMm, state.creep.mode, state.creep.manualAmountMm);

  return (
    <div className="settings-panel flex h-auto max-h-[46vh] w-full shrink-0 flex-col overflow-y-auto border-t border-slate-200 bg-white md:h-full md:max-h-none md:w-[320px] md:border-l md:border-t-0 lg:w-[340px]">
      <PanelSection title="Arah Binding">
        <Select
          value={state.bindingDirection}
          onChange={(e) => dispatch({ type: "SET_BINDING_DIRECTION", direction: e.target.value as "left" | "right" })}
        >
          <option value="left">Kiri</option>
          <option value="right">Kanan</option>
        </Select>
      </PanelSection>

      <PanelSection title="Bleed & Margin">
        <Field
          label={
            <>
              Bleed
              <InfoTip
                label="bleed"
                text="Area lebih di luar trim yang ikut dicetak, supaya potongan tidak menyisakan tepi putih. Bleed juga menentukan apakah artwork halaman sumber di-fit ke bleed box atau ke trim."
              />
            </>
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={state.bleedMm}
              onChange={(e) => dispatch({ type: "SET_BLEED", value: readNumberInput(e.target.value, { fallback: state.bleedMm, min: 0, max: 10 }) })}
              className="w-full accent-indigo-600"
            />
            <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-600 tabular-nums">
              {state.bleedMm} mm
            </span>
          </div>
        </Field>
        <Field
          label={
            <>
              Safe Area
              <InfoTip
                label="safe area"
                text="Jarak aman dari tepi trim untuk teks dan elemen penting. Ditampilkan sebagai garis putus-putus biru di preview."
              />
            </>
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={state.safeAreaMm}
              onChange={(e) => dispatch({ type: "SET_SAFE_AREA", value: readNumberInput(e.target.value, { fallback: state.safeAreaMm, min: 0, max: 20 }) })}
              className="w-full accent-indigo-600"
            />
            <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-600 tabular-nums">
              {state.safeAreaMm} mm
            </span>
          </div>
        </Field>
        <Field
          label={
            <>
              Gutter
              <InfoTip
                label="gutter"
                text="Ruang tambahan di sisi binding untuk perfect binding, supaya teks tidak hilang ke dalam lem. Tidak dipakai pada binding lipatan."
              />
            </>
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={state.gutterMm}
              onChange={(e) => dispatch({ type: "SET_GUTTER", value: readNumberInput(e.target.value, { fallback: state.gutterMm, min: 0, max: 50 }) })}
              className="w-full accent-indigo-600"
            />
            <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-600 tabular-nums">
              {state.gutterMm} mm
            </span>
          </div>
        </Field>
      </PanelSection>

      <PanelSection title="Panduan & Mark">
        <Checkbox label="Crop Mark" checked={state.marks.showCropMarks} onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showCropMarks: v } })} />
        <Checkbox label="Area Bleed" checked={state.marks.showBleedArea} onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showBleedArea: v } })} />
        <Checkbox label="Area Safe" checked={state.marks.showSafeArea} onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showSafeArea: v } })} />
        <Checkbox label="Garis Lipat" checked={state.marks.showFoldMarks} onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showFoldMarks: v } })} />
        <Checkbox label="Garis Tengah" checked={state.marks.showCenterLine} onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showCenterLine: v } })} />
        <Checkbox
          label="Registration Mark"
          checked={state.marks.showRegistrationMarks}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showRegistrationMarks: v } })}
        />
      </PanelSection>

      <PanelSection title="Creep">
        <NumberField
          label="Tebal Kertas (mm)"
          value={state.creep.paperThicknessMm}
          range={{ min: 0, max: 1, step: 0.01 }}
          onCommit={(paperThicknessMm) => dispatch({ type: "SET_CREEP", creep: { paperThicknessMm } })}
        />
        <Field label="Mode">
          <Select
            value={state.creep.mode}
            onChange={(e) => dispatch({ type: "SET_CREEP", creep: { mode: e.target.value as "auto" | "manual" } })}
          >
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </Select>
        </Field>
        {state.creep.mode === "manual" && (
          <NumberField
            label="Manual (mm)"
            value={state.creep.manualAmountMm}
            range={{ min: 0, max: 20 }}
            onCommit={(manualAmountMm) => dispatch({ type: "SET_CREEP", creep: { manualAmountMm } })}
          />
        )}
        <div className="flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
          <span className="flex items-center gap-1">
            Geser maks. <b className="tabular-nums">{estimatedCreep.toFixed(2)} mm</b>
            <InfoTip
              label="estimasi creep"
              text={`Dihitung per signature: ${deepestSignature} lembar bertumpuk, sheet terluar bergeser paling jauh. Creep menggeser tiap halaman keluar sedikit supaya setelah dilipat tidak terpotong.`}
            />
          </span>
          <span className="text-violet-500">{deepestSignature} lembar</span>
        </div>
      </PanelSection>
    </div>
  );
}
