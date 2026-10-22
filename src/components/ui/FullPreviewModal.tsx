import { useEffect, useState } from "react";
import { X, ExternalLink, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

export default function FullPreviewModal({
  url,
  onClose,
  title = "Pratinjau PDF",
}: {
  url: string;
  onClose: () => void;
  title?: string;
}) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom(z=>Math.min(3, +(z+0.15).toFixed(2)));
      if (e.key === "-") setZoom(z=>Math.max(0.5, +(z-0.15).toFixed(2)));
      if (e.key === "0") setZoom(1);
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
          <div className="flex items-center gap-1 rounded-lg bg-white/10 px-1 py-1">
            <button onClick={()=>setZoom(z=>Math.max(0.5, +(z-0.15).toFixed(2)))} title="Zoom out (-)" className="rounded p-1 text-white hover:bg-white/20"><ZoomOut className="h-4 w-4" /></button>
            <span className="min-w-[3.5rem] text-center text-xs font-semibold text-white">{Math.round(zoom*100)}%</span>
            <button onClick={()=>setZoom(z=>Math.min(3, +(z+0.15).toFixed(2)))} title="Zoom in (+)" className="rounded p-1 text-white hover:bg-white/20"><ZoomIn className="h-4 w-4" /></button>
            <button onClick={()=>setZoom(1)} title="Reset (0)" className="rounded p-1 text-white hover:bg-white/20"><RotateCcw className="h-3.5 w-3.5" /></button>
          </div>
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
      <div className="flex-1 overflow-auto p-3 sm:p-4" onWheel={(e)=>{ e.preventDefault(); const d = e.deltaY < 0 ? 0.1 : -0.1; setZoom(z=> Math.min(3, Math.max(0.5, +(z+d).toFixed(2)))); }}>
        <div className="mx-auto flex min-h-full items-center justify-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          <iframe src={url} title={title} className="h-[80vh] w-[90vw] max-w-5xl rounded-xl border border-white/10 bg-white shadow-2xl" />
        </div>
      </div>
      <p className="py-1.5 text-center text-xs text-white/50">Scroll untuk zoom · +/- untuk zoom · 0 untuk reset · ESC untuk tutup</p>
    </div>
  );
}
