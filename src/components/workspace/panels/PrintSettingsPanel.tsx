import { useProject } from "../../../state/ProjectContext";
import { PanelSection, Field, NumberField, Checkbox, Select } from "./PanelShell";
import { computeCreepShiftMm, planImposition } from "../../../lib/imposition";
import { readNumberInput } from "../../../lib/paperSizes";

export default function PrintSettingsPanel() {
  const { state, dispatch } = useProject();

  const plan = planImposition(state.pages.length, state.binding, state.signatureSize, state.bindingDirection);
  // Creep is scoped to a single signature: the outermost sheet of the deepest
  // signature is the worst case, not the outermost sheet of the whole run.
  const deepestSignature = Math.max(1, ...Object.values(plan.signatureSheetCounts));
  const estimatedCreep = computeCreepShiftMm(1, deepestSignature, state.creep.paperThicknessMm, state.creep.mode, state.creep.manualAmountMm);

  return (
    <div className="settings-panel flex max-h-[46vh] h-auto w-full shrink-0 flex-col overflow-y-auto border-t md:max-h-none md:h-full md:w-[300px] lg:w-[340px] xl:w-[360px] md:border-t-0 md:border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <PanelSection title="Binding Direction">
        <Select
          value={state.bindingDirection}
          onChange={(e) => dispatch({ type: "SET_BINDING_DIRECTION", direction: e.target.value as "left" | "right" })}
        >
          <option value="left">Left binding</option>
          <option value="right">Right binding</option>
        </Select>
      </PanelSection>

      <PanelSection title="Bleed, Safe Area & Gutter">
        <Field label={`Bleed: ${state.bleedMm} mm`}>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={state.bleedMm}
            onChange={(e) => dispatch({ type: "SET_BLEED", value: readNumberInput(e.target.value, { fallback: state.bleedMm, min: 0, max: 10 }) })}
            className="w-full accent-indigo-600"
          />
        </Field>
        <Field label={`Safe Area: ${state.safeAreaMm} mm`}>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={state.safeAreaMm}
            onChange={(e) => dispatch({ type: "SET_SAFE_AREA", value: readNumberInput(e.target.value, { fallback: state.safeAreaMm, min: 0, max: 20 }) })}
            className="w-full accent-indigo-600"
          />
        </Field>
        <Field label={`Gutter (Perfect Binding): ${state.gutterMm} mm`}>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={state.gutterMm}
            onChange={(e) => dispatch({ type: "SET_GUTTER", value: readNumberInput(e.target.value, { fallback: state.gutterMm, min: 0, max: 50 }) })}
            className="w-full accent-indigo-600"
          />
        </Field>
      </PanelSection>

      <PanelSection title="Guides & Marks">
        <Checkbox
          label="Show Crop Marks"
          checked={state.marks.showCropMarks}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showCropMarks: v } })}
        />
        <Checkbox
          label="Show Bleed Area"
          checked={state.marks.showBleedArea}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showBleedArea: v } })}
        />
        <Checkbox
          label="Show Safe Area"
          checked={state.marks.showSafeArea}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showSafeArea: v } })}
        />
        <Checkbox
          label="Show Fold Marks"
          checked={state.marks.showFoldMarks}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showFoldMarks: v } })}
        />
        <Checkbox
          label="Show Center Line"
          checked={state.marks.showCenterLine}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showCenterLine: v } })}
        />
        <Checkbox
          label="Show Registration Marks"
          checked={state.marks.showRegistrationMarks}
          onChange={(v) => dispatch({ type: "SET_MARKS", marks: { showRegistrationMarks: v } })}
        />
      </PanelSection>

      <PanelSection title="Creep Compensation">
        <NumberField
          label="Paper Thickness (mm)"
          value={state.creep.paperThicknessMm}
          range={{ min: 0, max: 1, step: 0.01 }}
          onCommit={(paperThicknessMm) => dispatch({ type: "SET_CREEP", creep: { paperThicknessMm } })}
        />
        <Field label="Creep Amount">
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
            label="Manual Amount (mm)"
            value={state.creep.manualAmountMm}
            range={{ min: 0, max: 20 }}
            onCommit={(manualAmountMm) => dispatch({ type: "SET_CREEP", creep: { manualAmountMm } })}
          />
        )}
        <div className="rounded-lg bg-violet-50 p-3 text-xs text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          Estimasi pergeseran maksimum (sheet terluar): <b>{estimatedCreep.toFixed(2)} mm</b> pada signature {deepestSignature} lembar
          bertumpuk.
        </div>
      </PanelSection>
    </div>
  );
}
