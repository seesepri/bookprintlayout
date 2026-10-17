import { useState } from "react";
import {
  Moon,
  Sun,
  UploadCloud,
  Copy,
  SlidersHorizontal,
  BookMarked,
  Image as ImageIcon,
  DownloadCloud,
  Layers3,
} from "lucide-react";

import { useProject, useProjectActions } from "../../state/ProjectContext";
import { ViewKey } from "../../types";
import { cn } from "../../utils/cn";
import { currentTheme, toggleTheme, type Theme } from "../../lib/theme";

const MENU: { key: ViewKey; label: string; icon: any }[] = [
  { key: "upload", label: "Upload PDF", icon: UploadCloud },
  { key: "pages", label: "Pages", icon: Copy },
  { key: "layout", label: "Layout Settings", icon: Layers3 },
  { key: "book", label: "Book Settings", icon: BookMarked },
  { key: "print", label: "Print Settings", icon: SlidersHorizontal },
  { key: "cover", label: "Cover", icon: ImageIcon },
  { key: "export", label: "Export", icon: DownloadCloud },
];

export default function Sidebar() {
  const { state } = useProject();
  const { setView, goLanding } = useProjectActions();
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  return (
    <aside className="workspace-sidebar flex h-full w-14 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:w-60">
      <button
        onClick={goLanding}
        className="workspace-brand flex items-center justify-center gap-2.5 border-b border-slate-200 px-2 py-3.5 text-left md:justify-start md:px-4 dark:border-slate-800"
      >
        <div className="flex items-center gap-2.5">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-sm" 
            />
            <span className="hidden text-lg font-bold tracking-tight md:inline">
              BookPrint <span className="text-indigo-600">Layout</span>
            </span>
        </div>
      </button>

      <nav className="workspace-nav flex-1 space-y-1 overflow-y-auto px-2 py-3 md:px-3 md:py-4">
        {MENU.map((item) => {
          const Icon = item.icon;
          const active = state.activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                "workspace-nav-item flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition md:px-3",
                active
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-2 py-3 md:px-3 dark:border-slate-800">
        <button
          onClick={() => setTheme(toggleTheme())}
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "Mode terang" : "Mode gelap"}
          className="flex w-full items-center justify-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 md:justify-start md:px-3 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="hidden md:inline">{theme === "dark" ? "Mode Terang" : "Mode Gelap"}</span>
        </button>
      </div>
    </aside>
  );
}

