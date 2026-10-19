import { useMemo } from "react";
import { useProject } from "../../../state/ProjectContext";
import { planImposition } from "../../../lib/imposition";
import { gridSheetSize, normalizePagesPerSide } from "../../../lib/nup";
import { geometryConstants } from "../../../lib/geometry";
import { resolveSheet } from "../../../lib/previewHelpers";
import { Orientation, PresetBookSize, PresetPaperSize } from "../../../types";
import { PanelSection, Field, Select, NumberField } from "./PanelShell";

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
            <NumberField
              label="Width (mm)"
              value={state.bookSizeCustom.width}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={width => dispatch({ type: "SET_BOOK_SIZE_CUSTOM", size: { ...state.bookSizeCustom, width } })}
            />
            <NumberField
              label="Height (mm)"
              value={state.bookSizeCustom.height}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={height => dispatch({ type: "SET_BOOK_SIZE_CUSTOM", size: { ...state.bookSizeCustom, height } })}
            />
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
            <NumberField
              label="Width (mm)"
              value={state.paperSizeCustom.width}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={width => dispatch({ type: "SET_PAPER_SIZE_CUSTOM", size: { ...state.paperSizeCustom, width } })}
            />
            <NumberField
              label="Height (mm)"
              value={state.paperSizeCustom.height}
              range={{ min: 20, max: 2000, step: 0.1 }}
              onCommit={height => dispatch({ type: "SET_PAPER_SIZE_CUSTOM", size: { ...state.paperSizeCustom, height } })}
            />
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
            {activePaperSize.width} × {activePaperSize.height} mm
          </div>
        )}

        <Field label="Pages per sheet side">
          <Select
            value={state.pagesPerSide}
            onChange={(e) => dispatch({ type: "SET_PAGES_PER_SIDE", value: normalizePagesPerSide(e.target.value) })}
          >
            <option value="auto">Auto — {folded ? "2 per sisi (spread)" : "4 per sisi kalau muat"}</option>
            <option value="2">2 per side (side-by-side spread)</option>
            <option value="4" disabled={nestedSignature}>
              4 per side (2 × 2 grid){folded ? " — head-to-head" : ""}
            </option>
          </Select>
          {nestedSignature ? (
            <p className="mt-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              Binding <b>Signature</b> tetap spread 2 per sisi: lembaran-nya bersarang dan kena creep, jadi menambah
              slot mengubah lembar mana duduk di mana. Pakai <i>Booklet</i> atau <i>Saddle-stitch</i> untuk 4 per sisi.
            </p>
          ) : folded && layout.slotsPerSide === 2 ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {state.binding}: 2 per sisi (satu spread per sisi). Pilih <b>4 per side</b> untuk menumpuk dua spread dalam
              satu lembar {paper.width}×{paper.height} mm — baris atas dicetak kepala-ke-kepala, jadi cukup dilipat
              sekali di garis tengah tanpa dipotong.
            </p>
          ) : folded ? (
            <p className="mt-1 text-[11px] leading-relaxed text-indigo-500 dark:text-indigo-400">
              {state.quadHeadToHead
                ? `Head-to-head aktif: ${layout.slotsPerSide * 2} halaman per lembar (2 spread per sisi), baris atas terbalik 180°. Lipat lembar di garis tengah vertikal, urutan baca sudah benar tanpa potong.`
                : `Baris atas dicetak tegak: ${layout.slotsPerSide * 2} halaman per lembar. Potong di garis potong horizontal, lalu putar salah satu bagian 180° sebelum dilipat.`}
            </p>
          ) : null}
        </Field>

        {folded && layout.slotsPerSide > 2 && (
          <Field label="Baris atas">
            <Select
              value={state.quadHeadToHead ? "head-to-head" : "upright"}
              onChange={(e) => dispatch({ type: "SET_QUAD_HEAD_TO_HEAD", value: e.target.value === "head-to-head" })}
            >
              <option value="head-to-head">Head-to-head — lipat sekali, tanpa potong</option>
              <option value="upright">Tegak — potong tengah, saya balik sendiri</option>
            </Select>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {state.quadHeadToHead
                ? "Baris atas diputar 180° supaya kedua band bertemu kepala-ke-kepala."
                : "Kedua baris dicetak tegak; potong di tick batas baris, lalu putar salah satu bagian."}{" "}
              4-up dicetak mark saja: tick kiri-kanan di batas baris jadi patokan potong, tanpa garis melintang di atas
              artwork.
            </p>
          </Field>
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
        <div className="space-y-1.5 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          <p>
            Setiap lembar {paper.width}×{paper.height} mm memuat <b>{layout.slotsPerSide} halaman</b> ({layout.grid.cols}×
            {layout.grid.rows}) per sisi — {layout.slotsPerSide * 2} halaman per lembar,{" "}
            <b>{sheetCount} lembar</b> untuk {state.pages.length} halaman.
          </p>
          {layout.reason === "pair-folded" && !nestedSignature && (
            <p className="text-indigo-500 dark:text-indigo-400">
              Satu spread per sisi. Pilih <b>4 per side</b> untuk menumpuk dua spread dalam satu lembar: baris atas
              dicetak head-to-head, cukup dilipat sekali di garis tengah.
            </p>
          )}
          {layout.reason === "pair-fits-only" && (
            <p className="text-indigo-500 dark:text-indigo-400">
              4 halaman per sisi butuh lembar {quadNeed.width.toFixed(1)}×{quadNeed.height.toFixed(1)} mm; kertas{" "}
              {paper.width}×{paper.height} mm belum cukup (ukuran buku {activeBookSize.width}×{activeBookSize.height}{" "}
              mm, bleed {state.bleedMm} mm).
            </p>
          )}
          {layout.marksClipped && (
            <p className="text-amber-600 dark:text-amber-400">
              Crop marks tidak kebagian ruang di lembar ini, jadi mark yang tidak muat dilewati.{" "}
              {quadMarksNeed.width.toFixed(1)}×{quadMarksNeed.height.toFixed(1)} mm dibutuhkan supaya mark ikut tampil{" "}
              — atau potong lembar mengikuti tepi halaman trim.
            </p>
          )}
        </div>
      </PanelSection>
    </div>
  );
}
