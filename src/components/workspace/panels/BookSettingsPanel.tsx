import { useMemo } from "react";
import { useProject } from "../../../state/ProjectContext";
import { planImposition } from "../../../lib/imposition";
import { gridSheetSize, normalizePagesPerSide } from "../../../lib/nup";
import { geometryConstants } from "../../../lib/geometry";
import { resolveSheet } from "../../../lib/previewHelpers";
import type { Orientation, PresetBookSize, PresetPaperSize } from "../../../types";
import { PanelSection, Field, Select, NumberField } from "./PanelShell";
import { InfoTip } from "../../ui/InfoTip";

const BOOK_PRESETS: PresetBookSize[] = ["A4", "A5", "A6", "B5", "Letter", "Custom"];
const PAPER_PRESETS: PresetPaperSize[] = ["A4", "A3", "A2", "F4", "SRA3", "Custom"];

export default function BookSettingsPanel() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();

  // Resolved exactly like the exporter and the canvas do, so this estimate is
  // the sheet that gets printed and not a rounded guess.
  const { paper, layout } = useMemo(
    () =>
      resolveSheet({
        paper: activePaperSize,
        orientation: state.orientation,
        bookSize: activeBookSize,
        binding: state.binding,
        setting: state.pagesPerSide,
        bleedMm: state.bleedMm,
        gutterMm: state.gutterMm,
        showCropMarks: state.marks.showCropMarks,
      }),
    [
      activePaperSize,
      state.orientation,
      activeBookSize,
      state.binding,
      state.pagesPerSide,
      state.bleedMm,
      state.gutterMm,
      state.marks.showCropMarks,
    ]
  );
  const sheetCount = useMemo(
    () =>
      planImposition(state.pages.length || 0, state.binding, state.signatureSize, state.bindingDirection, {
        slotsPerSide: layout.slotsPerSide,
      }).sheets.length,
    [state.pages.length, state.binding, state.signatureSize, state.bindingDirection, layout.slotsPerSide]
  );
  /* The gate the chooser uses (block + bleed, marks aside) and the sheet size
     that would additionally give the crop marks their room. */
  const quadRoom = {
    bleedMm: Math.max(0, state.bleedMm),
    gutterMm: state.binding === "perfect-binding" ? Math.max(0, state.gutterMm) : 0,
  };
  const quadNeed = gridSheetSize(activeBookSize, { cols: 2, rows: 2 }, { ...quadRoom, marksRoomMm: 0 });
  const folded = state.binding !== "perfect-binding";
  const nestedSignature = state.binding === "signature";
  const quadMarksNeed = gridSheetSize(activeBookSize, { cols: 2, rows: 2 }, {
    ...quadRoom,
    marksRoomMm: geometryConstants.cropGapMm + geometryConstants.cropLengthMm,
  });

  return (
    <div className="settings-panel flex h-auto max-h-[46vh] w-full shrink-0 flex-col overflow-y-auto border-t border-slate-200 bg-white md:h-full md:max-h-none md:w-[320px] md:border-l md:border-t-0 lg:w-[340px] dark:border-slate-800 dark:bg-slate-900">
      <PanelSection title="Ukuran Buku">
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
            <NumberField
              label="Lebar (mm)"
              value={state.bookSizeCustom.width}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={width => dispatch({ type: "SET_BOOK_SIZE_CUSTOM", size: { ...state.bookSizeCustom, width } })}
            />
            <NumberField
              label="Tinggi (mm)"
              value={state.bookSizeCustom.height}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={height => dispatch({ type: "SET_BOOK_SIZE_CUSTOM", size: { ...state.bookSizeCustom, height } })}
            />
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {activeBookSize.width} × {activeBookSize.height} mm
          </div>
        )}
      </PanelSection>

      <PanelSection title="Ukuran Kertas">
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
            <NumberField
              label="Lebar (mm)"
              value={state.paperSizeCustom.width}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={width => dispatch({ type: "SET_PAPER_SIZE_CUSTOM", size: { ...state.paperSizeCustom, width } })}
            />
            <NumberField
              label="Tinggi (mm)"
              value={state.paperSizeCustom.height}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={height => dispatch({ type: "SET_PAPER_SIZE_CUSTOM", size: { ...state.paperSizeCustom, height } })}
            />
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {activePaperSize.width} × {activePaperSize.height} mm
          </div>
        )}

        <Field
          label={
            <>
              Halaman per Sisi
              <InfoTip
                label="halaman per sisi"
                text="Satu sisi lembar bisa memuat satu spread (2 halaman) atau grid 2×2 (4 halaman). Untuk binding lipatan, 4 per sisi dicetak head-to-head: baris atas terbalik 180° dan kolomnya dicerminkan, jadi satu lipatan di tengah sudah menghasilkan urutan baca yang benar."
              />
            </>
          }
        >
          <Select
            value={state.pagesPerSide}
            onChange={(e) => dispatch({ type: "SET_PAGES_PER_SIDE", value: normalizePagesPerSide(e.target.value) })}
          >
            <option value="auto">Auto</option>
            <option value="2">2 per sisi</option>
            <option value="4" disabled={nestedSignature}>
              4 per sisi
            </option>
          </Select>
          {nestedSignature ? (
            <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <span>Signature selalu spread 2 per sisi.</span>
              <InfoTip
                label="signature 2 per sisi"
                text="Lembar pada binding Signature bersarang dan terkena creep, jadi menambah slot mengubah lembar mana duduk di mana. Pakai Booklet atau Saddle-stitch untuk 4 per sisi."
              />
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {folded
                ? layout.slotsPerSide > 2
                  ? `${layout.slotsPerSide * 2} halaman/lembar · lipat sekali di tengah`
                  : "1 spread per sisi"
                : `${layout.slotsPerSide} halaman per sisi`}
              {folded && layout.slotsPerSide === 2 && (
                <>
                  {" · "}
                  <span className="text-slate-500 dark:text-slate-400">4 per sisi butuh kertas lebih besar</span>
                </>
              )}
            </p>
          )}
        </Field>

        {folded && layout.slotsPerSide > 2 && (
          <Field
            label={
              <>
                Baris Atas
                <InfoTip
                  label="baris atas"
                  text="Head-to-head: baris atas diputar 180° supaya kedua band bertemu kepala-ke-kepala — cukup dilipat sekali, tanpa potong. Tegak: kedua baris dicetak tegak, potong di tick batas baris lalu putar salah satu bagian 180° sendiri. Lembar 4-up dicetak mark saja, tanpa garis melintang di atas artwork."
                />
              </>
            }
          >
            <Select
              value={state.quadHeadToHead ? "head-to-head" : "upright"}
              onChange={(e) => dispatch({ type: "SET_QUAD_HEAD_TO_HEAD", value: e.target.value === "head-to-head" })}
            >
              <option value="head-to-head">Head-to-head (lipat)</option>
              <option value="upright">Tegak (potong)</option>
            </Select>
          </Field>
        )}

        <Field label="Orientasi">
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

      <PanelSection title="Perkiraan Lembar">
        <div className="rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
          <p className="flex items-center gap-1 font-semibold">
            {sheetCount} lembar
            <InfoTip
              label="perkiraan lembar"
              text={`Setiap lembar ${paper.width}×${paper.height} mm memuat ${layout.slotsPerSide} halaman (${layout.grid.cols}×${layout.grid.rows}) per sisi — ${layout.slotsPerSide * 2} halaman per lembar — untuk ${state.pages.length} halaman.`}
            />
          </p>
          <p className="mt-1 text-indigo-600 dark:text-indigo-300">
            {layout.grid.cols}×{layout.grid.rows} · {layout.slotsPerSide * 2} halaman/lembar
          </p>
        </div>

        {layout.reason === "pair-fits-only" && (
          <p className="flex items-start gap-1 text-[11px] leading-relaxed text-indigo-500 dark:text-indigo-400">
            <span>
              4 per sisi butuh kertas {quadNeed.width.toFixed(1)}×{quadNeed.height.toFixed(1)} mm.
            </span>
            <InfoTip
              label="kenapa belum 4-up"
              text={`Kertas ${paper.width}×${paper.height} mm belum cukup untuk ukuran buku ${activeBookSize.width}×${activeBookSize.height} mm dengan bleed ${state.bleedMm} mm.`}
            />
          </p>
        )}
        {layout.marksClipped && (
          <p className="flex items-start gap-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            <span>Crop mark tidak kebagian ruang, jadi dilewati.</span>
            <InfoTip
              label="crop mark terpotong"
              text={`${quadMarksNeed.width.toFixed(1)}×${quadMarksNeed.height.toFixed(1)} mm dibutuhkan supaya mark ikut tampil — atau potong lembar mengikuti tepi halaman trim.`}
            />
          </p>
        )}
      </PanelSection>
    </div>
  );
}
