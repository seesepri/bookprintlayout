import { useState } from "react";
import {
  BookImage,
  BookOpen,
  Download,
  Files,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  SlidersHorizontal,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import toast from "react-hot-toast";
import { useProject, useProjectActions } from "../../state/ProjectContext";
import type { ViewKey } from "../../types";
import { cn } from "../../utils/cn";

/**
 * One icon per step, chosen for what the step *is* rather than what it touches.
 * `Copy` used to stand for Pages (a photocopier) and a bare `Image` for Cover;
 * at 56 px wide those two were indistinguishable from the Upload glyph beside
 * them. Labels stay in one language, with the print terms that have no
 * Indonesian equivalent left alone.
 */
const MENU: { key: ViewKey; label: string; icon: LucideIcon }[] = [
  { key: "upload", label: "Upload", icon: UploadCloud },
  { key: "pages", label: "Halaman", icon: Files },
  { key: "layout", label: "Layout", icon: Layers },
  { key: "book", label: "Ukuran Buku", icon: BookOpen },
  { key: "print", label: "Cetak", icon: SlidersHorizontal },
  { key: "cover", label: "Cover", icon: BookImage },
  { key: "export", label: "Ekspor", icon: Download },
];

/**
 * Closed is the default on a screen too narrow to hold the sidebar — that is the
 * behaviour the old fixed rail gave phones for free. Initialisation only; after
 * the first render the user is in charge.
 */
const startsCollapsed = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? !window.matchMedia("(min-width: 768px)").matches
    : false;

export default function Sidebar() {
  const { state } = useProject();
  const { setView, goLanding, resetProject } = useProjectActions();
  const hasWork = state.pages.length > 0;
  const [collapsed, setCollapsed] = useState(startsCollapsed);

  const startNewProject = () => {
    if (!hasWork || window.confirm("Mulai proyek baru? Layout saat ini dibuang, termasuk simpanan otomatisnya.")) {
      resetProject();
      toast.success("Proyek dikosongkan");
    }
  };

  return (
    <>
      {/*
        When the sidebar is closed its own logo leaves the screen with it, so the
        way back in is a separate, floating copy of the same trigger. Hovering it
        reveals the open/close control, exactly like the one inside the rail.
      */}
      {collapsed && (
        <div className="group fixed left-3 top-3 z-40 flex items-center">
          <button
            onClick={goLanding}
            title="seebook"
            aria-label="seebook — ke beranda"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md ring-1 ring-slate-200 transition hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <img src="/logo.png" alt="Logo seebook" className="h-8 w-8 rounded-lg object-cover" />
          </button>
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Buka sidebar"
            title="Buka sidebar"
            className="ml-1 rounded-lg bg-white p-1.5 text-slate-500 opacity-0 shadow-md ring-1 ring-slate-200 transition hover:text-indigo-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group-hover:opacity-100"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      <aside
        className={cn(
          "workspace-sidebar h-full shrink-0 overflow-hidden bg-white transition-[width] duration-200 ease-out",
          collapsed ? "w-0" : "w-56 border-r border-slate-200"
        )}
      >
        {/* Fixed inner width: the labels must not reflow while the rail animates. */}
        <div className="flex h-full w-56 flex-col">
          <div className="group flex items-center gap-1 border-b border-slate-200 px-3 py-3">
            <button
              onClick={goLanding}
              title="seebook"
              aria-label="seebook — ke beranda"
              className="flex items-center justify-center rounded-lg p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <img src="/logo.png" alt="Logo seebook" className="h-8 w-8 object-cover" />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Tutup sidebar"
              title="Tutup sidebar"
              className="ml-auto rounded-lg p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group-hover:opacity-100"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <nav className="workspace-nav flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
            {MENU.map((item) => {
              const Icon = item.icon;
              const active = state.activeView === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "workspace-nav-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                    active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 px-2.5 py-2.5">
            <div className="px-2.5 font-mono text-[11px] text-slate-400" title="Commit yang membangun bundle ini">
              build {__BUILD_ID__}
            </div>
            {hasWork && (
              <button
                onClick={startNewProject}
                title="Kosongkan proyek dan simpanan otomatisnya"
                className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span>Proyek Baru</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
