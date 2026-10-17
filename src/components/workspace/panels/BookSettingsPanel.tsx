import { useProject } from "../../../state/ProjectContext";
import { Orientation, PresetBookSize, PresetPaperSize } from "../../../types";
import { PanelSection, Field, Select, NumberInput } from "./PanelShell";
import { readNumberInput, snapToStep } from "../../../lib/paperSizes";

const BOOK_PRESETS: PresetBookSize[] = ["A4", "A5", "A6", "B5", "Letter", "Custom"];
const PAPER_PRESETS: PresetPaperSize[] = ["A4", "A3", "A2", "F4", "SRA3", "Custom"];

export default function BookSettingsPanel() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();

  return (
    <div className="settings-panel flex max-h-[46vh] h-auto w-full shrink-0 flex-col overflow-y-auto border-t md:max-h-none md:h-full md:w-[300px] lg:w-[340px] xl:w-[360px] md:border-t-0 md:border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <PanelSection title="Book Size (Trim Size)">
        <Select
          value={state.bookSizePreset}
          onChange={(e) => dispatch({ type: "SET_BOOK_SIZE_PRESET", preset: e.target.value as PresetBookSize })}
        >
          {BOOK_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        {state.bookSizePreset === "Custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (mm)">
              <NumberInput
                value={state.bookSizeCustom.width}
                onChange={(e) =>
                  dispatch({
                    type: "SET_BOOK_SIZE_CUSTOM",
                    size: { ...state.bookSizeCustom, width: snapToStep(readNumberInput(e.target.value, { fallback: state.bookSizeCustom.width, min: 20, max: 2000 })) },
                  })
                }
              />
            </Field>
            <Field label="Height (mm)">
              <NumberInput
                value={state.bookSizeCustom.height}
                onChange={(e) =>
                  dispatch({
                    type: "SET_BOOK_SIZE_CUSTOM",
                    size: { ...state.bookSizeCustom, height: snapToStep(readNumberInput(e.target.value, { fallback: state.bookSizeCustom.height, min: 20, max: 2000 })) },
                  })
                }
              />
            </Field>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
            {activeBookSize.width} × {activeBookSize.height} mm
          </div>
        )}
      </PanelSection>

      <PanelSection title="Paper Size (Print Sheet)">
        <Select
          value={state.paperSizePreset}
          onChange={(e) => dispatch({ type: "SET_PAPER_SIZE_PRESET", preset: e.target.value as PresetPaperSize })}
        >
          {PAPER_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        {state.paperSizePreset === "Custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (mm)">
              <NumberInput
                value={state.paperSizeCustom.width}
                onChange={(e) =>
                  dispatch({
                    type: "SET_PAPER_SIZE_CUSTOM",
                    size: { ...state.paperSizeCustom, width: snapToStep(readNumberInput(e.target.value, { fallback: state.paperSizeCustom.width, min: 20, max: 2000 })) },
                  })
                }
              />
            </Field>
            <Field label="Height (mm)">
              <NumberInput
                value={state.paperSizeCustom.height}
                onChange={(e) =>
                  dispatch({
                    type: "SET_PAPER_SIZE_CUSTOM",
                    size: { ...state.paperSizeCustom, height: snapToStep(readNumberInput(e.target.value, { fallback: state.paperSizeCustom.height, min: 20, max: 2000 })) },
                  })
                }
              />
            </Field>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
            {activePaperSize.width} × {activePaperSize.height} mm
          </div>
        )}

        <Field label="Orientation">
          <Select
            value={state.orientation}
            onChange={(e) => dispatch({ type: "SET_ORIENTATION", orientation: e.target.value as Orientation })}
          >
            <option value="auto">Auto</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
        </Field>
      </PanelSection>

      <PanelSection title="Perkiraan Sheet Dibutuhkan">
        <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          Setiap lembar {activePaperSize.width}×{activePaperSize.height} mm memuat 2 halaman berukuran{" "}
          {activeBookSize.width}×{activeBookSize.height} mm secara berdampingan.
        </div>
      </PanelSection>
    </div>
  );
}
