import { useEffect, useState } from "react";
import { DownloadCloud, Loader2, FileCheck2, Gauge } from "lucide-react";
import { useProject } from "../../../state/ProjectContext";
import { ExportFormat, ExportQuality } from "../../../types";
import { buildImpositionPdf, bytesToBlob } from "../../../lib/pdfEngine";
import { planImposition } from "../../../lib/imposition";
import { validateImposition } from "../../../lib/geometry";
import { orientedPaperSize } from "../../../lib/previewHelpers";
import toast from "react-hot-toast";

const FORMATS: { key: ExportFormat; label: string; desc: string }[] = [
  { key: "print-ready", label: "PDF Print Ready", desc: "Semua lembar imposition lengkap dengan marks." },
  { key: "preview", label: "PDF Preview", desc: "Versi ringan untuk pratinjau/approval klien." },
  { key: "per-signature", label: "PDF Per Signature", desc: "File terpisah per signature (diunduh sebagai satu PDF gabungan bertanda)." },
];

const QUALITIES: { key: ExportQuality; label: string }[] = [
  { key: "standard", label: "Standard" },
  { key: "high", label: "High Quality" },
  { key: "print", label: "Print Quality" },
];

export default function ExportView() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const plan = planImposition(state.pages.length, state.binding, state.signatureSize, state.bindingDirection);
  const paper = orientedPaperSize(activePaperSize, state.orientation, activeBookSize);
  const validation = validateImposition({
    pages: state.pages,
    sheets: plan.sheets,
    sheetCount: plan.sheets.length,
    paddedTotal: plan.paddedTotal,
    paper,
    bookSize: activeBookSize,
    bleedMm: state.exportSettings.includeBleed ? state.bleedMm : 0,
    gutterMm: state.gutterMm,
    safeAreaMm: state.safeAreaMm,
    marks: { ...state.marks, showCropMarks: state.exportSettings.includeCropMarks && state.marks.showCropMarks },
    binding: state.binding,
    creep: state.creep,
  });

  useEffect(() => {
    // Invalidate an old generated preview only when an actual layout/export
    // input changes. Avoid depending on derived object references such as
    // `paper`, which are recreated on every render and would clear the PDF
    // immediately after generation.
    setPreviewUrl(null);
  }, [
    state.pages,
    state.binding,
    state.bindingDirection,
    state.signatureSize,
    activeBookSize.width,
    activeBookSize.height,
    paper.width,
    paper.height,
    state.bleedMm,
    state.safeAreaMm,
    state.gutterMm,
    state.marks.showCropMarks,
    state.marks.showCenterLine,
    state.marks.showSafeArea,
    state.exportSettings.includeCropMarks,
    state.exportSettings.includeBleed,
    state.exportSettings.includeRegistration,
    state.creep.mode,
    state.creep.paperThicknessMm,
    state.creep.manualAmountMm,
  ]);

  const generate = async () => {
    if (!state.sourceBytes || !state.pages.length) {
      toast.error("Upload PDF terlebih dahulu sebelum export.");
      return;
    }
    if (!validation.valid) {
      toast.error(validation.errors[0] || "Layout tidak valid. Export dibatalkan.");
      return;
    }
    dispatch({ type: "SET_GENERATING", value: true });
    const id = toast.loading("Menghasilkan PDF siap cetak...");
    try {
      const bytes = await buildImpositionPdf({
        sourceBytes: state.sourceBytes,
        pages: state.pages,
        binding: state.binding,
        bindingDirection: state.bindingDirection,
        signatureSize: state.signatureSize,
        bookSize: activeBookSize,
        paperSize: paper,
            bleedMm: state.exportSettings.includeBleed ? state.bleedMm : 0,
        safeAreaMm: state.marks.showSafeArea ? state.safeAreaMm : 0,
        gutterMm: state.gutterMm,
        creep: state.creep,
        marks: {
          ...state.marks,
          showCropMarks: state.exportSettings.includeCropMarks && state.marks.showCropMarks,
          showCenterLine: state.exportSettings.includeRegistration && state.marks.showCenterLine,
        },
      });
      dispatch({ type: "SET_GENERATED", bytes });
      const blob = bytesToBlob(bytes);
      setPreviewUrl(URL.createObjectURL(blob));
      toast.success("PDF siap cetak berhasil dibuat!", { id });
    } catch (e) {
      console.error(e);
      toast.error("Gagal membuat PDF.", { id });
    } finally {
      dispatch({ type: "SET_GENERATING", value: false });
    }
  };

  const download = () => {
    if (!state.generatedPdf) return;
    const blob = bytesToBlob(state.generatedPdf);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = state.meta.fileName.replace(/\.pdf$/i, "") || "bookprint";
    a.download = `${base}_imposed.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Export</h2>
      <p className="mb-6 text-sm text-slate-500">Hasilkan file PDF final yang siap dikirim ke mesin cetak.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Export Format</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => dispatch({ type: "SET_EXPORT", settings: { format: f.key } })}
                  className={`rounded-xl border px-3.5 py-3 text-left transition ${
                    state.exportSettings.format === f.key
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{f.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{f.desc}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
              <Gauge className="h-3.5 w-3.5" /> Quality
            </h3>
            <div className="flex gap-2">
              {QUALITIES.map((q) => (
                <button
                  key={q.key}
                  onClick={() => dispatch({ type: "SET_EXPORT", settings: { quality: q.key } })}
                  className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                    state.exportSettings.quality === q.key
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Opsi Tambahan</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ["includeCropMarks", "Include Crop Marks"],
                  ["includeBleed", "Include Bleed"],
                  ["includeRegistration", "Include Registration Marks"],
                  ["compress", "Compress PDF"],
                  ["embedFonts", "Embed Fonts"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={(state.exportSettings as any)[key]}
                    onChange={(e) => dispatch({ type: "SET_EXPORT", settings: { [key]: e.target.checked } as any })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <button
            onClick={generate}
            disabled={state.isGenerating || !validation.valid}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {state.isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            Generate Print PDF
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Ringkasan</h3>
          <dl className="space-y-2 text-sm">
            <RowInfo k="Total Halaman" v={String(state.pages.length)} />
            <RowInfo k="Total Sheet" v={String(plan.sheets.length)} />
            <RowInfo k="Book Size" v={`${activeBookSize.width}×${activeBookSize.height}mm`} />
            <RowInfo k="Paper Size" v={`${paper.width}×${paper.height}mm`} />
            <RowInfo k="Binding" v={`${state.binding} / ${state.bindingDirection}`} />
          </dl>

          <div className={`mt-4 rounded-lg border p-3 text-xs ${validation.valid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            <div className="font-semibold">{validation.valid ? "✓ Layout valid" : "✕ Export diblokir"}</div>
            <div className="mt-1">Required: {validation.requiredSheet.width.toFixed(1)} × {validation.requiredSheet.height.toFixed(1)} mm</div>
            {!validation.valid && validation.errors.map((error) => <div key={error} className="mt-1">• {error}</div>)}
            {validation.warnings.map((warning) => <div key={warning} className="mt-1 text-amber-700">⚠ {warning}</div>)}
          </div>

          {previewUrl && state.generatedPdf ? (
            <div className="mt-4">
              <iframe src={previewUrl} className="h-64 w-full rounded-lg border border-slate-200 dark:border-slate-700" />
              <button
                onClick={download}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                <DownloadCloud className="h-4 w-4" /> Download PDF
              </button>
            </div>
          ) : (
            <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400 dark:border-slate-700">
              Preview file hasil generate akan muncul di sini
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowInfo({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 capitalize dark:border-slate-800">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-semibold text-slate-700 dark:text-slate-200">{v}</dd>
    </div>
  );
}
