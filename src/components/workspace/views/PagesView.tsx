import { useEffect, useMemo, useState } from "react";
import { CopyPlus, EllipsisVertical, FilePlus2, Maximize2, Repeat, RotateCw, Trash2, X } from "lucide-react";
import { useProject } from "../../../state/ProjectContext";
import type { PageInfo, SizeMM } from "../../../types";
import { mmToPt } from "../../../lib/paperSizes";
import { resolvePrintPlan } from "../../../lib/plan";
import toast from "react-hot-toast";

let blankCounter = 0;

function makeBlankPage(bookSize: SizeMM): PageInfo {
  blankCounter += 1;
  return {
    id: `blank-${Date.now()}-${blankCounter}`,
    originalIndex: null,
    rotation: 0,
    isBlank: true,
    // A blank must carry the book's own trim size: a fixed A5 box made the
    // grid card and any downstream measurement wrong for other book sizes.
    widthPt: mmToPt(bookSize.width),
    heightPt: mmToPt(bookSize.height),
  };
}

export default function PagesView() {
  const { state, dispatch, activeBookSize, activePaperSize } = useProject();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<number | null>(null);
  const [replaceValue, setReplaceValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<PageInfo | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    // Delay untuk menghindari close langsung saat klik yang membuka
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
    };
  }, [openMenuId]);

  const updatePages = (pages: PageInfo[]) => dispatch({ type: "SET_PAGES", pages });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === state.pages.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(state.pages.map((p) => p.id)));
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (!count) return;
    const remaining = state.pages.filter((p) => !selectedIds.has(p.id));
    updatePages(remaining);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    toast.success(`${count} halaman dihapus.`);
  };

  const rotatePage = (idx: number) => {
    const pages = [...state.pages];
    const rotations: PageInfo["rotation"][] = [0, 90, 180, 270];
    const current = rotations.indexOf(pages[idx].rotation);
    pages[idx] = { ...pages[idx], rotation: rotations[(current + 1) % 4] };
    updatePages(pages);
  };

  const duplicatePage = (idx: number) => {
    const pages = [...state.pages];
    const dup = { ...pages[idx], id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
    pages.splice(idx + 1, 0, dup);
    updatePages(pages);
  };

  const insertBlank = (idx: number) => {
    const pages = [...state.pages];
    pages.splice(idx + 1, 0, makeBlankPage(activeBookSize));
    updatePages(pages);
  };

  const onDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    const pages = [...state.pages];
    const [moved] = pages.splice(dragIndex, 1);
    pages.splice(idx, 0, moved);
    updatePages(pages);
    setDragIndex(null);
  };

  /**
   * The engine already pads a short run virtually, so a book that is not a
   * multiple of the signature size still prints. Materialising those blanks is
   * for the cases where the *file* must be complete: a printer who counts
   * pages, or a workflow that re-imposes from this PDF.
   *
   * The count has to come from the same plan the exporter builds: a 4-up sheet
   * carries eight pages, so "pad to a multiple of 4" left a 10-page book three
   * pages short of complete while reporting success.
   */
  const blanksNeeded = useMemo(
    () =>
      resolvePrintPlan({
        pageCount: state.pages.length,
        paperSize: activePaperSize,
        bookSize: activeBookSize,
        orientation: state.orientation,
        binding: state.binding,
        bindingDirection: state.bindingDirection,
        signatureSize: state.signatureSize,
        pagesPerSide: state.pagesPerSide,
        bleedMm: state.bleedMm,
        gutterMm: state.gutterMm,
        showCropMarks: state.marks.showCropMarks,
      }).blanks,
    [
      state.pages.length,
      activePaperSize,
      activeBookSize,
      state.orientation,
      state.binding,
      state.bindingDirection,
      state.signatureSize,
      state.pagesPerSide,
      state.bleedMm,
      state.gutterMm,
      state.marks.showCropMarks,
    ]
  );

  const paddingCount = () => blanksNeeded;

  const padToSignature = () => {
    const count = paddingCount();
    if (!count) {
      toast.success("Jumlah halaman sudah pas dengan ukuran signature.");
      return;
    }
    updatePages([...state.pages, ...Array.from({ length: count }, () => makeBlankPage(activeBookSize))]);
    toast.success(`${count} halaman kosong ditambahkan di akhir (total ${state.pages.length + count}).`);
  };

  const applyReplace = () => {
    if (replaceTarget === null) return;
    const pages = [...state.pages];
    if (replaceValue.toLowerCase() === "blank") {
      pages[replaceTarget] = { ...makeBlankPage(activeBookSize), id: pages[replaceTarget].id };
    } else {
      const num = Number(replaceValue);
      const src = pages[num - 1];
      if (!src) {
        toast.error("Nomor halaman sumber tidak valid.");
        return;
      }
      pages[replaceTarget] = { ...src, id: pages[replaceTarget].id, rotation: 0 };
    }
    updatePages(pages);
    setReplaceTarget(null);
    setReplaceValue("");
    toast.success("Halaman berhasil diganti.");
  };

  if (!state.pages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-slate-400">
        <FilePlus2 className="h-9 w-9" />
        <p className="text-sm font-medium">Belum ada PDF. Buka menu Upload.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Halaman</h2>
          <p className="text-[13px] text-slate-500">
            {state.pages.length} halaman · geser kartu untuk mengurutkan
            {selectedIds.size > 0 && <span className="ml-2 font-semibold text-indigo-600">· {selectedIds.size} dipilih</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {paddingCount() > 0 && (
            <button
              onClick={padToSignature}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3.5 py-2 text-[13px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              <FilePlus2 className="h-4 w-4" /> Lengkapi {paddingCount()} halaman
            </button>
          )}
          <button
            onClick={() => insertBlank(state.pages.length - 1)}
            title="Tambah halaman kosong"
            aria-label="Tambah halaman kosong"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 hover:text-indigo-600"
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          {selectedIds.size > 0 && (
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[12px] font-semibold text-indigo-700">
              <input
                type="checkbox"
                checked={selectedIds.size === state.pages.length && state.pages.length > 0}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Pilih semua
            </label>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              title={`Hapus ${selectedIds.size} halaman terpilih`}
              aria-label={`Hapus ${selectedIds.size} halaman terpilih`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Hapus halaman terpilih?</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              {selectedIds.size} halaman akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={deleteSelected}
                className="flex-1 rounded-lg bg-red-600 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {state.pages.map((p, idx) => (
          <div
            key={p.id}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(idx)}
            // Without this, a cancelled drag leaves `dragIndex` set and the next
            // drop reorders from the stale source.
            onDragEnd={() => setDragIndex(null)}
            className={`group relative rounded-xl border bg-white p-2 transition hover:shadow-md ${selectedIds.has(p.id) ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-300"}`}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 opacity-0 transition group-hover:opacity-100 data-[checked]:opacity-100"
                  style={{ opacity: selectedIds.has(p.id) ? 1 : undefined }}
                  title="Pilih halaman ini"
                />
                <span className="cursor-grab text-[11px] font-bold text-slate-400">#{idx + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                {p.isBlank && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400">
                    Kosong
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === p.id ? null : p.id);
                  }}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  title="Menu halaman"
                  aria-label="Menu halaman"
                >
                  <EllipsisVertical className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {openMenuId === p.id && (
              <div
                className="absolute right-2 top-8 z-20 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <MenuItem icon={RotateCw} label="Putar 90°" onClick={() => { rotatePage(idx); setOpenMenuId(null); }} />
                <MenuItem icon={CopyPlus} label="Duplikat" onClick={() => { duplicatePage(idx); setOpenMenuId(null); }} />
                <MenuItem icon={Repeat} label="Ganti halaman" onClick={() => { setReplaceTarget(idx); setReplaceValue(""); setOpenMenuId(null); }} />
                <MenuItem icon={FilePlus2} label="Sisip halaman kosong" onClick={() => { insertBlank(idx); setOpenMenuId(null); }} />
              </div>
            )}
            <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
              {p.thumbnail ? (
                <img
                  src={p.thumbnail}
                  alt={`Halaman ${idx + 1}${p.isBlank ? " (kosong)" : ""}`}
                  className="h-full w-full object-contain"
                  style={{ transform: `rotate(${p.rotation}deg)`, imageRendering: "auto" as const }}
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <span className="text-2xl font-black text-slate-300">—</span>
              )}
              {p.thumbnail && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewPage(p); setPreviewZoom(1);
                  }}
                  title="Lihat full preview"
                  className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/30 group-hover:opacity-100"
                >
                  <span className="rounded-full bg-white/95 p-2 shadow-lg">
                    <Maximize2 className="h-4 w-4 text-slate-700" />
                  </span>
                </button>
              )}
            </div>
            {replaceTarget === idx && (
              <div className="absolute inset-x-1 top-9 z-10 rounded-lg border border-indigo-200 bg-white p-2 shadow-xl">
                <input
                  autoFocus
                  placeholder="No. halaman / blank"
                  value={replaceValue}
                  onChange={(e) => setReplaceValue(e.target.value)}
                  className="mb-1.5 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <div className="flex gap-1">
                  <button
                    onClick={applyReplace}
                    className="flex-1 rounded bg-indigo-600 py-1 text-[11px] font-semibold text-white"
                  >
                    Ganti
                  </button>
                  <button
                    onClick={() => setReplaceTarget(null)}
                    className="flex-1 rounded border border-slate-300 py-1 text-[11px]"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {previewPage && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-sm" onClick={() => setPreviewPage(null)}>
          <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Preview — Halaman {state.pages.findIndex(p=>p.id===previewPage.id)+1}</h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-white/10 px-1.5 py-1">
                <button onClick={(e)=>{e.stopPropagation(); setPreviewZoom(z=>Math.max(0.5, +(z-0.15).toFixed(2)))}} className="rounded px-1.5 py-0.5 text-white hover:bg-white/20 text-sm">−</button>
                <span className="min-w-[3.5rem] text-center text-xs font-semibold text-white">{Math.round(previewZoom*100)}%</span>
                <button onClick={(e)=>{e.stopPropagation(); setPreviewZoom(z=>Math.min(3, +(z+0.15).toFixed(2)))}} className="rounded px-1.5 py-0.5 text-white hover:bg-white/20 text-sm">+</button>
              </div>
              <button onClick={()=>{ setPreviewZoom(1)}} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20">Reset</button>
              <button onClick={() => setPreviewPage(null)} className="rounded-lg bg-white p-1.5 text-slate-700 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            className="flex flex-1 items-center justify-center overflow-auto p-4"
            onClick={e=>e.stopPropagation()}
            onWheel={(e)=>{ e.preventDefault(); const d = e.deltaY < 0 ? 0.1 : -0.1; setPreviewZoom(z=> Math.min(3, Math.max(0.5, +(z+d).toFixed(2)))); }}
          >
            <img src={previewPage.thumbnail} alt="Preview" className="rounded-xl bg-white shadow-2xl object-contain transition-transform" style={{ transform: `rotate(${previewPage.rotation}deg) scale(${previewZoom})`, maxHeight: '80vh', maxWidth: '90vw' }} />
          </div>
          <p className="py-2 text-center text-xs text-white/60">Scroll untuk zoom · {Math.round(previewZoom*100)}%</p>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-700 transition hover:bg-slate-50"
    >
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      {label}
    </button>
  );
}
