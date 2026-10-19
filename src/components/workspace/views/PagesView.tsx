import { useMemo, useState } from "react";
import {
  RotateCw,
  Trash2,
  CopyPlus,
  FilePlus2,
  GripVertical,
  Repeat,
} from "lucide-react";
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

  const updatePages = (pages: PageInfo[]) => dispatch({ type: "SET_PAGES", pages });

  const rotatePage = (idx: number) => {
    const pages = [...state.pages];
    const rotations: PageInfo["rotation"][] = [0, 90, 180, 270];
    const current = rotations.indexOf(pages[idx].rotation);
    pages[idx] = { ...pages[idx], rotation: rotations[(current + 1) % 4] };
    updatePages(pages);
  };

  const deletePage = (idx: number) => {
    const pages = [...state.pages];
    pages.splice(idx, 1);
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
        <FilePlus2 className="h-10 w-10" />
        <p className="text-sm font-medium">Belum ada PDF yang diunggah. Buka menu Upload PDF terlebih dahulu.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Page Management</h2>
          <p className="text-sm text-slate-500">
            {state.pages.length} halaman · Drag thumbnail untuk mengubah urutan.
          </p>
        </div>
        <div className="flex gap-2">
          {paddingCount() > 0 && (
            <button
              onClick={padToSignature}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900/60 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              <FilePlus2 className="h-4 w-4" /> Lengkapi {paddingCount()} halaman
            </button>
          )}
          <button
            onClick={() => insertBlank(state.pages.length - 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FilePlus2 className="h-4 w-4" /> Insert Blank Page
          </button>
        </div>
      </div>

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
            className="group relative rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                <GripVertical className="h-3 w-3 cursor-grab" /> #{idx + 1}
              </span>
              {p.isBlank && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400 dark:bg-slate-800">
                  Blank
                </span>
              )}
            </div>
            <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
              {p.thumbnail ? (
                <img
                  src={p.thumbnail}
                  alt={`Halaman ${idx + 1}${p.isBlank ? " (kosong)" : ""}`}
                  className="h-full w-full object-contain"
                  style={{ transform: `rotate(${p.rotation}deg)` }}
                  draggable={false}
                />
              ) : (
                <span className="text-2xl font-black text-slate-300">—</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
                <IconBtn onClick={() => rotatePage(idx)} title="Rotate">
                  <RotateCw className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={() => duplicatePage(idx)} title="Duplicate">
                  <CopyPlus className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={() => insertBlank(idx)} title="Insert Blank After">
                  <FilePlus2 className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  onClick={() => {
                    setReplaceTarget(idx);
                    setReplaceValue("");
                  }}
                  title="Replace"
                >
                  <Repeat className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={() => deletePage(idx)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </div>
            {replaceTarget === idx && (
              <div className="absolute inset-x-1 top-9 z-10 rounded-lg border border-indigo-200 bg-white p-2 shadow-xl dark:border-indigo-800 dark:bg-slate-900">
                <input
                  autoFocus
                  placeholder="No. halaman / 'blank'"
                  value={replaceValue}
                  onChange={(e) => setReplaceValue(e.target.value)}
                  className="mb-1.5 w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                />
                <div className="flex gap-1">
                  <button
                    onClick={applyReplace}
                    className="flex-1 rounded bg-indigo-600 py-1 text-[11px] font-semibold text-white"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => setReplaceTarget(null)}
                    className="flex-1 rounded border border-slate-300 py-1 text-[11px] dark:border-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md bg-white/90 p-1.5 text-slate-700 shadow hover:bg-white"
    >
      {children}
    </button>
  );
}
