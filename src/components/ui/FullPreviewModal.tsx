import { useEffect } from "react";
import { X, ExternalLink } from "lucide-react";

export default function FullPreviewModal({
  url,
  onClose,
  title = "Pratinjau PDF",
}: {
  url: string;
  onClose: () => void;
  title?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            title="Buka di tab baru"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Tab baru
          </button>
          <button
            onClick={onClose}
            title="Tutup (ESC)"
            className="rounded-lg bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 sm:p-4">
        <iframe src={url} title={title} className="h-full w-full rounded-xl border border-white/10 bg-white shadow-2xl" />
      </div>
    </div>
  );
}
