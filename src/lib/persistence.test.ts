import { describe, expect, it, vi } from "vitest";
import { initialState, type ProjectState } from "../state/ProjectContext";
import type { PageInfo } from "../types";
import {
  PROJECT_SCHEMA_VERSION,
  clearProject,
  hasProject,
  loadProject,
  markResumeSettled,
  mergeRestoredState,
  saveProject,
  toSavedState,
} from "./persistence";

function pages(count: number): PageInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    originalIndex: i + 1,
    rotation: 0 as const,
    isBlank: false,
    thumbnail: "data:image/jpeg;base64,AAAA",
    widthPt: 595,
    heightPt: 842,
  }));
}

function state(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    ...initialState,
    route: "workspace",
    meta: {
      fileName: "buku.pdf",
      fileSizeBytes: 3,
      pageCount: 8,
      pageSizePt: { width: 595, height: 842 },
      status: "ready",
    },
    sourceBytes: new Uint8Array([1, 2, 3]),
    pages: pages(8),
    ...overrides,
  };
}

describe("toSavedState", () => {
  it("keeps the layout settings, page order and source bytes", () => {
    const saved = toSavedState(state({ bleedMm: 7, gutterMm: 4, binding: "perfect-binding" }));
    expect(saved.bleedMm).toBe(7);
    expect(saved.gutterMm).toBe(4);
    expect(saved.binding).toBe("perfect-binding");
    expect(saved.pages).toHaveLength(8);
    expect(saved.pages[3].id).toBe("p3");
    expect(saved.meta.fileName).toBe("buku.pdf");
    expect(saved.sourceBytes).toBeInstanceOf(Uint8Array);
  });

  it("drops every thumbnail so the record stays small", () => {
    const saved = toSavedState(state({ pages: pages(200) }));
    expect(JSON.stringify(saved)).not.toContain("data:image");
    expect(saved.pages.every((page) => !("thumbnail" in page))).toBe(true);
  });

  it("drops cover file handles, which cannot be meaningfully restored", () => {
    const saved = toSavedState(
      state({ cover: { ...initialState.cover, frontFile: new File(["x"], "front.pdf"), spineWidthMm: 6.5 } })
    );
    expect(saved.cover.frontFile).toBeUndefined();
    expect(saved.cover.spineWidthMm).toBe(6.5);
  });

  it("records a schema version so old saves are discarded, not guessed at", () => {
    expect(PROJECT_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe("mergeRestoredState", () => {
  it("lands in the workspace with the saved layout intact", () => {
    const restored = mergeRestoredState(toSavedState(state({ bleedMm: 9, viewMode: "grid", zoom: 1.5 })));
    expect(restored.route).toBe("workspace");
    expect(restored.activeView).toBe("pages");
    expect(restored.bleedMm).toBe(9);
    expect(restored.viewMode).toBe("grid");
    expect(restored.pages).toHaveLength(8);
  });

  it("repairs a pages-per-side value an older save wrote as a string", () => {
    const saved = toSavedState(state());
    const restored = mergeRestoredState({ ...saved, pagesPerSide: "4" as unknown as 4 });
    expect(restored.pagesPerSide).toBe(4);
  });

  it("never resumes an in-flight or completed generation", () => {
    const restored = mergeRestoredState(
      toSavedState(
        state({ isGenerating: true, generatedPdf: new Uint8Array([9]), generatedCover: new Uint8Array([9]) })
      )
    );
    expect(restored.isGenerating).toBe(false);
    expect(restored.generatedPdf).toBeNull();
    expect(restored.generatedCover).toBeNull();
  });

  it("fills fields the record does not carry from the defaults", () => {
    const restored = mergeRestoredState(
      toSavedState(
        state({
          marks: { ...initialState.marks, showCropMarks: false },
          cover: { ...initialState.cover, frontFile: new File(["x"], "front.pdf") },
        })
      )
    );
    expect(restored.marks.showCropMarks).toBe(false);
    expect(restored.marks.showBleedArea).toBe(initialState.marks.showBleedArea);
    expect(restored.cover.frontFile).toBeNull();
    expect(restored.cover.includeCropMarks).toBe(initialState.cover.includeCropMarks);
  });

  it("survives a record whose source file no longer decodes", () => {
    const saved = toSavedState(state());
    const restored = mergeRestoredState({ ...saved, sourceBytes: new Uint8Array(0) });
    expect(restored.sourceBytes).toHaveLength(0);
    expect(restored.pages).toHaveLength(8);
  });
});

describe("hasProject", () => {
  it("is false for an empty session", () => {
    expect(hasProject(initialState)).toBe(false);
  });

  it("is true once a file or a page order exists", () => {
    expect(hasProject(state())).toBe(true);
    expect(hasProject(state({ pages: [], sourceBytes: new Uint8Array([1]) }))).toBe(true);
    expect(hasProject(state({ pages: pages(3), sourceBytes: null }))).toBe(true);
  });
});

describe("degraded storage", () => {
  // No IndexedDB here — private-mode browsers are the same case. Autosave must
  // degrade to a no-op instead of rejecting inside a React effect.
  it("writes, reads and clears without throwing", async () => {
    await expect(loadProject()).resolves.toBeNull();
    await expect(clearProject()).resolves.toBeUndefined();
  });

  // The whole point of the result value: silence here used to mean a user could
  // work for an hour and lose everything on reload with nothing on screen.
  it("reports the failure and names the cause instead of resolving quietly", async () => {
    // Writes are held back until boot has read the old record; past that point a
    // failure to store has to reach the caller.
    markResumeSettled();
    await expect(saveProject(state())).resolves.toEqual({ ok: false, reason: "blocked" });
  });

  it("stays quiet while boot has not finished reading the old record", async () => {
    vi.resetModules();
    const fresh = await import("./persistence");
    await expect(fresh.saveProject(state())).resolves.toEqual({ ok: true });
  });

  it("still resolves when there is nothing worth saving", async () => {
    await expect(saveProject(state({ pages: [], sourceBytes: null }))).resolves.toEqual({ ok: true });
  });
});
