import { useEffect, useState } from "react";
import { Download, FileCheck2, Loader2, Printer } from "lucide-react";
import { InfoTip } from "../../ui/InfoTip";
import { useProject } from "../../../state/ProjectContext";
import type { BooleanExportKey, ExportFormat, ExportSettings } from "../../../types";
import { buildImpositionPdf, bytesToBlob } from "../../../lib/pdfEngine";
import { splitPdfBySignature, zipFiles } from "../../../lib/pdfSplit";
import { EXPORT_SUFFIX, resolveExportOptions } from "../../../lib/exportOptions";
import toast from "react-hot-toast";

const FORMATS: { key: ExportFormat; label: string; desc: string }[] = [
  { key: "print-ready", label: "Print Ready", desc: "Lembar + marks." },
  { key: "preview", label: "Preview", desc: "Tanpa marks, untuk approval." },
  { key: "per-signature", label: "Per Signature", desc: "Pembatas di tiap signature." },
];

function downloadBytes(bytes: Uint8Array, filename: string, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportView() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // UI-only: how the per-signature result is packaged, not part of the project.
  const [zipPerSignature, setZipPerSignature] = useState(false);

  const resolved = resolveExportOptions(state, activeBookSize, activePaperSize);
  const { plan, paper, validation } = resolved;

  /** A booklet is one folded form by definition: there is nothing to split. */
  const canSplit =
    state.exportSettings.format === "per-signature" && plan.signatures.length > 1 && zipPerSignature;

  useEffect(() => {
    if (!previewUrl) return;
    // Object URLs for the preview iframe were never released, so every
    // "Generate" click leaked another copy of the PDF for the tab's lifetime.
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const setFlag = (key: BooleanExportKey, value: boolean) => {
    const patch: Partial<ExportSettings> = {};
    patch[key] = value;
    dispatch({ type: "SET_EXPORT", settings: patch });
  };

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
        grid: resolved.grid,
        quadHeadToHead: resolved.quadHeadToHead,
        bleedMm: resolved.bleedMm,
        safeAreaMm: resolved.safeAreaMm,
        gutterMm: resolved.gutterMm,
        creep: state.creep,
        marks: resolved.marks,
        pageNumbers: state.pageNumbers,
        // The split files are cut from the mark-complete sheet stack; the
        // divider pages of `per-signature` mode would only shift page indices.
        mode: canSplit ? "print-ready" : state.exportSettings.format,
        compress: resolved.compress,
      });

      const base = state.meta.fileName.replace(/\.pdf$/i, "") || "bookprint";
      if (canSplit) {
        const files = await splitPdfBySignature(bytes, plan.sheets, state.binding !== "perfect-binding");
        if (files && files.length) {
          const zip = zipFiles(files.map((file, i) => ({ name: `${base}_sig${i + 1}.pdf`, bytes: file })));
          downloadBytes(zip, `${base}_signatures.zip`, "application/zip");
          toast.success(`${files.length} file signature dibungkus jadi ZIP.`, { id });
          return;
        }
        toast.error("Hasil build tidak cocok dengan pemisahan signature — diekspor sebagai satu file.", { id });
      }

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
    const base = state.meta.fileName.replace(/\.pdf$/i, "") || "bookprint";
    downloadBytes(state.generatedPdf, `${base}_${EXPORT_SUFFIX[state.exportSettings.format] ?? "imposed"}.pdf`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-lg font-bold text-slate-900">Ekspor</h2>
      <p className="mb-6 text-[13px] text-slate-500">PDF final siap kirim ke mesin cetak.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Format</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => dispatch({ type: "SET_EXPORT", settings: { format: f.key } })}
                  className={`rounded-lg border px-3.5 py-2.5 text-left transition ${
                    state.exportSettings.format === f.key
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="text-[13px] font-semibold text-slate-800">{f.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{f.desc}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Per Signature</h3>
            {plan.signatures.length > 1 ? (
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={zipPerSignature}
                  onChange={(e) => setZipPerSignature(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="flex items-center gap-1 font-semibold text-[13px]">
                    Satu file per signature (ZIP)
                    <InfoTip
                      label="zip per signature"
                      text={`${plan.signatures.length} signature, tanpa halaman pembatas. Terunduh sebagai ${state.meta.fileName.replace(/\.pdf$/i, "") || "bookprint"}_signatures.zip. Kalau jumlah halaman tidak cocok dengan rencana, ZIP dibatalkan dan file tetap utuh.`}
                    />
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-[13px] text-slate-500">
                Satu signature — tidak ada yang bisa dipisah.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ["includeCropMarks", "Crop Mark"],
                  ["includeBleed", "Bleed"],
                  ["includeRegistration", "Registration Mark"],
                  ["compress", "Kompres PDF"],
                ] as [BooleanExportKey, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-[13px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={state.exportSettings[key]}
                    onChange={(e) => setFlag(key, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] leading-relaxed text-amber-800">
            <Printer className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex items-center gap-1.5">
              <span>
                Saat mencetak: <b>Duplex — Flip on short edge</b>, scaling <b>None</b>.
              </span>
              <InfoTip
                label="duplex"
                text="Sisi belakang lembar ditata untuk balik pada sumbu vertikal, sejajar garis lipat. Salah pilih “flip on long edge” membuat setiap halaman jatuh di belakang pasangan yang salah dan seluruh cetakan rusak. Preferensi ini juga ditulis ke file sebagai /ViewerPreferences /Duplex, tapi tidak semua driver membacanya."
              />
            </div>
          </section>

          <button
            onClick={generate}
            disabled={state.isGenerating || !validation.valid}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            Buat PDF
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Ringkasan</h3>
          <dl className="space-y-2 text-[13px]">
            <RowInfo k="Halaman" v={String(state.pages.length)} />
            <RowInfo k="Lembar" v={String(plan.sheets.length)} />
            <RowInfo k="Buku" v={`${activeBookSize.width}×${activeBookSize.height} mm`} />
            <RowInfo k="Kertas" v={`${paper.width}×${paper.height} mm`} />
            <RowInfo k="Binding" v={`${state.binding} / ${state.bindingDirection}`} />
            <RowInfo k="Sisi Belakang" v={state.binding === "perfect-binding" ? "Duplex" : "Duplex + lipat"} />
            <RowInfo k="Marks" v={Object.entries(resolved.marks).filter(([, on]) => on).map(([k]) => k.replace("show", "")).join(", ") || "—"} />
          </dl>

          <div className={`mt-4 rounded-lg border p-3 text-[11px] leading-relaxed ${validation.valid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            <div className="text-xs font-semibold">{validation.valid ? "Layout valid" : "Ekspor diblokir"}</div>
            <div className="mt-1 tabular-nums">
              Butuh {validation.requiredSheet.width.toFixed(1)} × {validation.requiredSheet.height.toFixed(1)} mm
            </div>
            {!validation.valid && validation.errors.map((error) => <div key={error} className="mt-1">• {error}</div>)}
            {validation.warnings.map((warning) => <div key={warning} className="mt-1 text-amber-700">⚠ {warning}</div>)}
          </div>

          {previewUrl && state.generatedPdf ? (
            <div className="mt-4">
              <iframe src={previewUrl} className="h-64 w-full rounded-lg border border-slate-200" />
              <button
                onClick={download}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" /> Unduh PDF
              </button>
            </div>
          ) : (
            <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-300 text-center text-[11px] text-slate-400">
              Pratinjau muncul setelah Buat PDF
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowInfo({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
      <dt className="shrink-0 text-slate-400">{k}</dt>
      <dd className="truncate text-right font-semibold text-slate-700">{v}</dd>
    </div>
  );
}
