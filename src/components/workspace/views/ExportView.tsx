import { useEffect, useState } from "react";
import { DownloadCloud, Loader2, FileCheck2, Printer } from "lucide-react";
import { useProject } from "../../../state/ProjectContext";
import { ExportFormat } from "../../../types";
import { buildImpositionPdf, bytesToBlob } from "../../../lib/pdfEngine";
import { EXPORT_SUFFIX, resolveExportOptions } from "../../../lib/exportOptions";
import toast from "react-hot-toast";

const FORMATS: { key: ExportFormat; label: string; desc: string }[] = [
  { key: "print-ready", label: "PDF Print Ready", desc: "Semua lembar imposition lengkap dengan marks." },
  { key: "preview", label: "PDF Preview", desc: "Tanpa marks, artwork pas di trim — buat approval klien." },
  { key: "per-signature", label: "PDF Per Signature", desc: "Halaman pembatas otomatis tiap awal signature, dalam satu file." },
];

export default function ExportView() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resolved = resolveExportOptions(state, activeBookSize, activePaperSize);
  const { plan, paper, validation } = resolved;

  useEffect(() => {
    if (!previewUrl) return;
    // Object URLs for the preview iframe were never released, so every
    // "Generate" click leaked another copy of the PDF for the tab's lifetime.
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

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
        bleedMm: resolved.bleedMm,
        safeAreaMm: resolved.safeAreaMm,
        gutterMm: resolved.gutterMm,
        creep: state.creep,
        marks: resolved.marks,
        mode: state.exportSettings.format,
        compress: resolved.compress,
      });
      dispatch({ type: "SET_GENERATED", bytes });
      setPreviewUrl(URL.createObjectURL(bytesToBlob(bytes)));
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
    a.download = `${base}_${EXPORT_SUFFIX[state.exportSettings.format] ?? "imposed"}.pdf`;
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
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Opsi Tambahan</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ["includeCropMarks", "Include Crop Marks"],
                  ["includeBleed", "Include Bleed"],
                  ["includeRegistration", "Include Registration Marks"],
                  ["compress", "Compress PDF (object streams)"],
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

          <section className="flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <Printer className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-bold">Saat mencetak: pilih Duplex — “Flip on short edge”</div>
              <div className="mt-1 leading-relaxed">
                Sisi belakang lembar ditata untuk balik sekrup vertikal (sejajar garis lipat). Salah pilih
                “flip on long edge” membuat semua halaman jatuh di belakang pasangan yang salah.
                Preferensi ini juga ditulis ke dalam file sebagai <code>/ViewerPreferences /Duplex</code>.
              </div>
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
            <RowInfo k="Halaman Belakang" v={state.binding === "perfect-binding" ? "Duplex, tanpa lipatan" : "Duplex + lipatan"} />
            <RowInfo k="Marks di Output" v={Object.entries(resolved.marks).filter(([, on]) => on).map(([k]) => k.replace("show", "")).join(", ") || "tidak ada"} />
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
