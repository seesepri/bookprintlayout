import { useEffect, useRef } from "react";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { ProjectProvider, useProject, useProjectDispatch } from "./state/ProjectContext";
import { restoreProject } from "./lib/restore";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./components/landing/Landing";
import Workspace from "./components/workspace/Workspace";

/** Replays the autosaved project once, on boot. */
function ResumeProject() {
  const { state, hydrate } = useProject();
  const dispatch = useProjectDispatch();
  const attempted = useRef(false);
  const pageCountRef = useRef(state.pages.length);
  pageCountRef.current = state.pages.length;

  useEffect(() => {
    if (attempted.current || state.pages.length) return;
    attempted.current = true;
    let cancelled = false;
    void restoreProject().catch(() => null).then((restored) => {
      // A resume that lands after the user already started working must lose:
      // overwriting a fresh upload is worse than skipping the autosave.
      if (cancelled || !restored || pageCountRef.current > 0) return;
      hydrate(restored);
      toast.success(
        `Proyek "${restored.meta.fileName}" dipulihkan — ${restored.pages.length} halaman`,
        { duration: 4000 }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [state.pages.length, hydrate, dispatch]);

  return null;
}

function Root() {
  const { state } = useProject();
  return (
    <>
      <ResumeProject />
      {state.route === "landing" ? <Landing /> : <Workspace />}
      <Toaster position="top-center" toastOptions={{ style: { fontSize: "13px" } }} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ProjectProvider>
        <Root />
      </ProjectProvider>
    </ErrorBoundary>
  );
}
