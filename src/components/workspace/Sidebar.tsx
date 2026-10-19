import { useState } from "react";
import {
  BookImage,
  BookOpen,
  Download,
  Files,
  Layers,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import toast from "react-hot-toast";
import { useProject, useProjectActions } from "../../state/ProjectContext";
import type { ViewKey } from "../../types";
import { cn } from "../../utils/cn";
import { currentTheme, toggleTheme, type Theme } from "../../lib/theme";

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

export default function Sidebar() {
  const { state } = useProject();
  const { setView, goLanding, resetProject } = useProjectActions();
  const hasWork = state.pages.length > 0;

  const startNewProject = () => {
    if (!hasWork || window.confirm("Mulai proyek baru? Layout saat ini dibuang, termasuk simpanan otomatisnya.")) {
      resetProject();
      toast.success("Proyek dikosongkan");
    }
  };
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  return (
    <aside className="workspace-sidebar flex h-full w-14 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:w-56">
      <button
        onClick={goLanding}
        className="workspace-brand flex items-center justify-center gap-2.5 border-b border-slate-200 px-2 py-3.5 text-left transition hover:bg-slate-50 md:justify-start md:px-4 dark:border-slate-800 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Logo BookPrint Layout"
            className="h-8 w-8 shrink-0 rounded-lg object-cover shadow-sm"
          />
          <span className="hidden text-[15px] font-bold tracking-tight text-slate-900 md:inline dark:text-white">
            BookPrint <span className="text-indigo-600 dark:text-indigo-400">Layout</span>
          </span>
        </div>
      </button>

      <nav className="workspace-nav flex-1 space-y-0.5 overflow-y-auto px-2 py-3 md:px-2.5">
        {MENU.map((item) => {
          const Icon = item.icon;
          const active = state.activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "workspace-nav-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                active
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-2 py-2.5 md:px-2.5 dark:border-slate-800">
        <button
          onClick={() => setTheme(toggleTheme())}
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "Mode terang" : "Mode gelap"}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 md:justify-start dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          <span className="hidden md:inline">{theme === "dark" ? "Terang" : "Gelap"}</span>
        </button>
        <div
          className="mt-1 hidden px-2.5 font-mono text-[11px] text-slate-400 md:block dark:text-slate-500"
          title="Commit yang membangun bundle ini"
        >
          build {__BUILD_ID__}
        </div>
        {hasWork && (
          <button
            onClick={startNewProject}
            title="Kosongkan proyek dan simpanan otomatisnya"
            className="mt-0.5 flex w-full items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 md:justify-start dark:text-slate-300 dark:hover:bg-red-950/30"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">Proyek Baru</span>
          </button>
        )}
      </div>
    </aside>
  );
}
