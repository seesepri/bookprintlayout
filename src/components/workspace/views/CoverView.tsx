import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookImage, Download, Expand, ExternalLink, Info, Loader2, UploadCloud } from "lucide-react";
import { useProject } from "../../../state/ProjectContext";
import { Checkbox, NumberBox } from "../panels/PanelShell";
import { buildCoverPdf, fileToBytes, bytesToBlob } from "../../../lib/pdfEngine";
import { estimateSpineWidthMm, leavesFor } from "../../../lib/spine";
import toast from "react-hot-toast";
import type { CoverSettings } from "../../../types";
import type { CoverNote } from "../../../lib/pdfEngine";
import { InfoTip } from "../../ui/InfoTip";
import FullPreviewModal from "../../ui/FullPreviewModal";

type CoverFileKey = "frontFile" | "backFile" | "spineFile";

export default function CoverView() {
  const { state, dispatch, activeBookSize } = useProject();
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullPreview, setFullPreview] = useState(false);
  // What the engine had to assume about the supplied artwork (extra pages, no
  // bleed). Kept next to the preview so it is still readable after the toast.
  const [notes, setNotes] = useState<CoverNote[]>([]);

  // Each Generate click made a new object URL that nothing ever released.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const totalCoverWidth = useMemo(
    () => activeBookSize.width * 2 + state.cover.spineWidthMm,
    [activeBookSize.width, state.cover.spineWidthMm]
  );
  const totalCoverHeight = activeBookSize.height;
  const previewAspectRatio = `${totalCoverWidth + state.cover.bleedMm * 2} / ${totalCoverHeight + state.cover.bleedMm * 2}`;

  // Spine width used to be a number the user had to bring from elsewhere.
  // The stack height is derivable: leaves x caliper, with the glued end of a
  // perfect-bound book compressed a little.
  const estimatedSpineMm = estimateSpineWidthMm({
    pageCount: state.pages.length,
    paperThicknessMm: state.creep.paperThicknessMm,
    compress: state.binding === "perfect-binding" ? 0.9 : 1,
  });

  const useEstimatedSpine = () =>
    dispatch({ type: "SET_COVER", cover: { spineWidthMm: estimatedSpineMm } });

  const setFile = (key: CoverFileKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const patch: Partial<CoverSettings> = {};
    patch[key] = e.target.files?.[0] ?? null;
    dispatch({ type: "SET_COVER", cover: patch });
  };

  const generateCover = async () => {
    setBusy(true);
    try {
      const front = state.cover.frontFile ? await fileToBytes(state.cover.frontFile) : null;
      const back = state.cover.backFile ? await fileToBytes(state.cover.backFile) : null;
      const spine = state.cover.spineFile ? await fileToBytes(state.cover.spineFile) : null;

      if (!front && !back && !spine) {
        toast.error("Unggah minimal salah satu bagian cover (front/back/spine).");
        setBusy(false);
        return;
      }

      const { bytes, notes } = await buildCoverPdf({
        bookSize: activeBookSize,
        spineWidthMm: state.cover.spineWidthMm,
        bleedMm: state.cover.bleedMm,
        frontBytes: front,
        backBytes: back,
        spineBytes: spine,
        includeCropMarks: state.cover.includeCropMarks,
      });
      dispatch({ type: "SET_GENERATED_COVER", bytes });
      const blob = bytesToBlob(bytes);
      setPreviewUrl(URL.createObjectURL(blob));
      setNotes(notes);
      if (notes.length) {
        // The cover still builds — the user asked for a file, and silently
        // dropping pages or pretending a bleedless artwork is fine would be
        // worse than saying what the sheet will actually print.
        toast(notes.length === 1 ? notes[0].message : `${notes.length} catatan pada artwork cover`, {
          icon: "⚠️",
          duration: 7000,
        });
      } else {
        toast.success("Cover layout berhasil dibuat!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Gagal membuat cover.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!state.generatedCover) return;
    const blob = bytesToBlob(state.generatedCover);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.meta.fileName.replace(/\.pdf$/i, "") || "cover"}_cover.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h2 className="flex items-center gap-1.5 text-lg font-bold text-slate-900">
          Cover
          <InfoTip
            label="cover"
            text="Back, spine, dan front disusun dalam satu lembar dengan bleed di sisi luar. Artwork yang lebih besar dari trim dianggap sudah membawa bleed sendiri dan di-fit ke bleed box."
          />
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-500">Back · Spine · Front dalam satu lembar.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              File cover <b>tidak tersimpan otomatis</b> — hanya pengaturan spine/bleed. Unggah ulang setelah reload.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UploadBox label="Belakang" onChange={setFile("backFile")} file={state.cover.backFile} />
            <UploadBox label="Spine" onChange={setFile("spineFile")} file={state.cover.spineFile} />
            <UploadBox label="Depan" onChange={setFile("frontFile")} file={state.cover.frontFile} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Pengaturan</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Lebar Buku (mm)">
                <input readOnly value={activeBookSize.width} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-500" />
              </Field>
              <Field label="Tinggi Buku (mm)">
                <input readOnly value={activeBookSize.height} className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-500" />
              </Field>
              <Field label="Lebar Spine (mm)">
                <NumberBox
                  value={state.cover.spineWidthMm}
                  range={{ min: 0, max: 200 }}
                  ariaLabel="Spine width in millimetres"
                  onCommit={(spineWidthMm) => dispatch({ type: "SET_COVER", cover: { spineWidthMm } })}
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    Est. {estimatedSpineMm} mm
                    <InfoTip
                      label="estimasi spine"
                      text={`${leavesFor(state.pages.length)} lembar × ${state.creep.paperThicknessMm} mm ketebalan kertas${state.binding === "perfect-binding" ? ", dikali 0,9 untuk compress lem perfect binding" : ""}. Tetap estimasi — ukur dengan kaliper di kertas cetak sebenarnya.`}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={useEstimatedSpine}
                    disabled={estimatedSpineMm <= 0 || Math.abs(estimatedSpineMm - state.cover.spineWidthMm) < 0.05}
                    className="rounded-lg border border-indigo-200 px-2 py-0.5 font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pakai
                  </button>
                </div>
              </Field>
              <Field label="Bleed (mm)">
                <NumberBox
                  value={state.cover.bleedMm}
                  range={{ min: 0, max: 50 }}
                  ariaLabel="Cover bleed in millimetres"
                  onCommit={(bleedMm) => dispatch({ type: "SET_COVER", cover: { bleedMm } })}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Checkbox
                label="Crop Mark"
                checked={state.cover.includeCropMarks}
                onChange={(v) => dispatch({ type: "SET_COVER", cover: { includeCropMarks: v } })}
              />
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-[11px] text-indigo-700">
              <span>Total lebar cover</span>
              <span className="font-semibold tabular-nums">
                {totalCoverWidth} mm <span className="font-normal text-indigo-500">+ bleed {state.cover.bleedMm}</span>
              </span>
            </div>
          </div>

          <button
            onClick={generateCover}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookImage className="h-4 w-4" />}
            Buat Cover
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {previewUrl ? (
            <>
              <div className="mb-3.5 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Pratinjau</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFullPreview(true)}
                    title="Fullscreen"
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-indigo-600"
                  >
                    <Expand className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => window.open(previewUrl!, "_blank", "noopener,noreferrer")}
                    title="Buka di tab baru"
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-indigo-600"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div
                className="mx-auto w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                style={{ aspectRatio: previewAspectRatio, maxHeight: "min(58vh, 520px)" }}
              >
                <iframe
                  src={previewUrl}
                  title="Generated Cover PDF Preview"
                  className="block h-full w-full border-0"
                />
              </div>
              {fullPreview && (
                <FullPreviewModal url={previewUrl!} onClose={() => setFullPreview(false)} title="Cover — Pratinjau PDF" />
              )}
              <button
                onClick={download}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" /> Unduh PDF
              </button>
              {notes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {notes.map((note) => (
                    <li
                      key={`${note.slot}-${note.kind}`}
                      className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{note.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <div>
                <BookImage className="mx-auto mb-3 h-7 w-7 text-slate-300" />
                <p className="text-[13px] font-medium text-slate-500">Pratinjau muncul setelah Buat Cover</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadBox({
  label,
  file,
  onChange,
}: {
  label: string;
  file?: File | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40">
      <UploadCloud className="h-4 w-4 text-slate-400" />
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <span className="max-w-full truncate text-[11px] text-slate-400">{file ? file.name : "PDF"}</span>
      <input type="file" accept="application/pdf" className="hidden" onChange={onChange} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
