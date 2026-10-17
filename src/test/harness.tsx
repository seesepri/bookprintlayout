import { useEffect, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { ProjectProvider, initialState, useProject, type ProjectState } from "../state/ProjectContext";
import type { PageInfo } from "../types";

/** A page list the way an upload would produce it. */
export function pagesOf(count: number): PageInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    originalIndex: i + 1,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 420,
    heightPt: 595,
  }));
}

export function projectState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    ...initialState,
    route: "workspace",
    meta: {
      fileName: "buku.pdf",
      fileSizeBytes: 1024,
      pageCount: 0,
      pageSizePt: { width: 420, height: 595 },
      status: "ready",
    },
    sourceBytes: new Uint8Array([1]),
    pages: pagesOf(0),
    ...overrides,
  };
}

/**
 * Seeds the provider with a project. `HYDRATE` is the same path the autosave
 * restore uses, so the tests exercise the resume code rather than a mock of it.
 */
function Seeder({ state, children }: { state: ProjectState; children: ReactNode }) {
  const { hydrate } = useProject();
  useEffect(() => {
    hydrate(state);
  }, [hydrate, state]);
  return <>{children}</>;
}

/** Reads back what a test needs to assert about the live store. */
function StateProbe() {
  const { state } = useProject();
  return (
    <div
      data-testid="probe"
      data-pages={state.pages.length}
      data-blanks={state.pages.filter((p) => p.isBlank).length}
      data-view={state.activeView}
      data-blankw={state.pages.find((p) => p.isBlank)?.widthPt ?? ""}
      data-bleed={state.bleedMm}
      data-route={state.route}
    />
  );
}

export function renderWithProject(ui: ReactNode, state: ProjectState = projectState()) {
  return render(
    <ProjectProvider>
      <Seeder state={state}>
        <>{ui}</>
        <StateProbe />
      </Seeder>
    </ProjectProvider>
  );
}
