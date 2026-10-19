import { useRef, useState } from "react";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";
import { useProject, useProjectActions } from "../../../state/ProjectContext";
import { handleFileUpload, looksLikePdf } from "../../../lib/uploadHandler";
import { bytesToSize } from "../../../utils/format";
import toast from "react-hot-toast";
import { InfoTip } from "../../ui/InfoTip";

export default function UploadView() {
  const { state, dispatch } = useProject();
  const { setView } = useProjectActions();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = async (file: File | undefined) => {
    if (!file) return;
    if (!looksLikePdf(file)) {
      toast.error("File harus berformat PDF.");
      return;
    }
    const id = toast.loading("Membaca & menganalisis PDF...");
    try {
      await handleFileUpload(file, dispatch, (done, total) => {
        toast.loading(`Membaca PDF — halaman ${done}/${total}`, { id });
      });
      toast.success("Dokumen berhasil dianalisis.", { id });
      setView("pages");
    } catch (e) {
      // e.message carries the specific reason (e.g. "file melebihi 150 MB").
      toast.error(e instanceof Error ? e.message : "Gagal memproses PDF.", { id });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-1.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Upload</h2>
        <InfoTip
          label="upload"
          text="PDF diproses sepenuhnya di perangkat Anda — tidak ada file yang dikirim ke server. Batas 150 MB; di atas 400 halaman, thumbnail halaman sisanya dibuat sebagai placeholder bernomor."
        />
      </div>

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
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-14 text-center transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
            : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-indigo-700"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
          <UploadCloud className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Drop PDF di sini</p>
          <p className="mt-0.5 text-xs text-slate-400">atau klik untuk memilih file · maks. 150 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => process(e.target.files?.[0])}
        />
      </div>

      {state.meta.status === "ready" && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <FileText className="h-7 w-7 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {state.meta.fileName}
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              {state.pages.length} halaman · {bytesToSize(state.meta.fileSizeBytes)} ·{" "}
              {(state.meta.pageSizePt.width * 0.3528).toFixed(0)}×{(state.meta.pageSizePt.height * 0.3528).toFixed(0)} mm
            </div>
          </div>
          <button
            onClick={() => setView("pages")}
            className="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
          >
            Lihat Halaman
          </button>
        </div>
      )}
    </div>
  );
}
