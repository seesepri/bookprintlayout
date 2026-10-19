import { useEffect } from "react";
import Sidebar from "./Sidebar";
import PreviewCanvas from "./PreviewCanvas";
import LayoutSettingsPanel from "./panels/LayoutSettingsPanel";
import BookSettingsPanel from "./panels/BookSettingsPanel";
import PrintSettingsPanel from "./panels/PrintSettingsPanel";
import UploadView from "./views/UploadView";
import PagesView from "./views/PagesView";
import CoverView from "./views/CoverView";
import ExportView from "./views/ExportView";
import { useProject } from "../../state/ProjectContext";

export default function Workspace() {
  const { state, dispatch } = useProject();

  // Prevent accidental browser zoom while adjusting settings with Ctrl/Cmd + mouse wheel
  // or Ctrl/Cmd + +/- . The app's own canvas zoom remains controlled by its toolbar.
  useEffect(() => {
    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const preventBrowserZoomKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '_')) {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', preventBrowserZoom, { passive: false });
    window.addEventListener('keydown', preventBrowserZoomKeys);

    return () => {
      window.removeEventListener('wheel', preventBrowserZoom);
      window.removeEventListener('keydown', preventBrowserZoomKeys);
    };
  }, []);

  useEffect(() => {
    const onUndo = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" && (target as HTMLInputElement).type === "text") return;
        event.preventDefault();
        dispatch({ type: "UNDO" });
      }
    };
    window.addEventListener("keydown", onUndo);
    return () => window.removeEventListener("keydown", onUndo);
  }, [dispatch]);

  const renderCenter = () => {
    switch (state.activeView) {
      case "upload":
        return <UploadView />;
      case "pages":
        return <PagesView />;
      case "cover":
        return <CoverView />;
      case "export":
        return <ExportView />;
      case "layout":
        return (
          <div className="workspace-settings-layout flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
            <PreviewCanvas />
            <LayoutSettingsPanel />
          </div>
        );
      case "book":
        return (
          <div className="workspace-settings-layout flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
            <PreviewCanvas />
            <BookSettingsPanel />
          </div>
        );
      case "print":
        return (
          <div className="workspace-settings-layout flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
            <PreviewCanvas />
            <PrintSettingsPanel />
          </div>
        );
      default:
        return <UploadView />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderCenter()}</div>
      </main>
    </div>
  );
}
