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
 * Open/closed is remembered for the life of the page — a trip to the landing
 * page and back keeps the rail as the user left it — but deliberately not
 * written to storage: every entry into the workspace starts on the rail.
 */
let collapsedForSession = true;

export default function Sidebar() {
  const { state } = useProject();
  const { setView, resetProject } = useProjectActions();
  const hasWork = state.pages.length > 0;
  const [collapsed, setCollapsed] = useState(collapsedForSession);

  const setCollapsedForSession = (next: boolean) => {
    collapsedForSession = next;
    setCollapsed(next);
  };

  const startNewProject = () => {
    if (!hasWork || window.confirm("Mulai proyek baru? Layout saat ini dibuang, termasuk simpanan otomatisnya.")) {
      resetProject();
      toast.success("Proyek dikosongkan");
    }
  };

  return (
    <aside
      className={cn(
        "workspace-sidebar flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/*
        The header is the toggle. Closed it is the logo alone, and hovering swaps
        the logo for the open icon in the very same 36 px box — so the control
        never moves or changes size when it is used. Open, the logo stays put and
        the close icon sits beside it inside the same button.
      */}
      {collapsed ? (
        <div className="flex h-[57px] shrink-0 items-center justify-center border-b border-slate-200">
          <button
            onClick={() => setCollapsedForSession(false)}
            aria-label="Buka sidebar"
            title="Buka sidebar"
            className="group relative flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <img
              src="/logo.png"
              alt="seebook"
              className="h-8 w-8 object-cover opacity-100 transition-opacity duration-150 group-hover:opacity-0"
            />
            <PanelLeftOpen className="absolute h-5 w-5 text-slate-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </button>
        </div>
      ) : (
        <div className="flex h-[57px] shrink-0 items-center border-b border-slate-200 px-3">
          <button
            onClick={() => setCollapsedForSession(true)}
            aria-label="Tutup sidebar"
            title="Tutup sidebar"
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <img src="/logo.png" alt="seebook" className="h-8 w-8 shrink-0 object-cover" />
            <PanelLeftClose className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      )}

      <nav className={cn("workspace-nav flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-3", collapsed ? "px-2" : "px-2.5")}>
        {MENU.map((item) => {
          const Icon = item.icon;
          const active = state.activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "workspace-nav-item flex w-full items-center rounded-lg py-2 text-[13px] font-medium transition",
                collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className={cn("border-t border-slate-200 py-2.5", collapsed ? "px-2" : "px-2.5")}>
        {!collapsed && (
          <div className="px-2.5 font-mono text-[11px] text-slate-400" title="Commit yang membangun bundle ini">
            build {__BUILD_ID__}
          </div>
        )}
        {hasWork && (
          <button
            onClick={startNewProject}
            title="Proyek Baru"
            className={cn(
              "mt-0.5 flex w-full items-center rounded-lg py-2 text-[13px] font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600",
              collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
            )}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Proyek Baru</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
