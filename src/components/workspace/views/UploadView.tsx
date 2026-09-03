import { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { useProject, useProjectActions } from "../../../state/ProjectContext";
import { handleFileUpload } from "../../../lib/uploadHandler";
import { bytesToSize } from "../../../lib/paperSizes";
import toast from "react-hot-toast";

export default function UploadView() {
  const { state, dispatch } = useProject();
  const { setView } = useProjectActions();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("File harus berformat PDF.");
      return;
    }
    const id = toast.loading("Membaca & menganalisis PDF...");
    try {
      await handleFileUpload(file, dispatch);
      toast.success("Dokumen berhasil dianalisis.", { id });
      setView("pages");
    } catch (e) {
      toast.error("Gagal memproses PDF.", { id });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Upload PDF</h2>
      <p className="mb-6 text-sm text-slate-500">Unggah file PDF buku yang akan dilayout untuk proses cetak.</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          process(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-16 text-center transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
            : "border-slate-300 bg-slate-50 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/40"
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">Drag &amp; drop file PDF di sini</p>
        <p className="text-sm text-slate-400">atau klik untuk memilih file dari komputer</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => process(e.target.files?.[0])}
        />
      </div>

      {state.meta.status === "ready" && (
        <div className="mt-6 flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <FileText className="h-8 w-8 text-emerald-600" />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> {state.meta.fileName}
            </div>
            <div className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              {state.pages.length} halaman · {bytesToSize(state.meta.fileSizeBytes)} ·{" "}
              {(state.meta.pageSizePt.width * 0.3528).toFixed(0)}×{(state.meta.pageSizePt.height * 0.3528).toFixed(0)} mm
            </div>
          </div>
          <button
            onClick={() => setView("pages")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Lihat Halaman
          </button>
        </div>
      )}
    </div>
  );
}
