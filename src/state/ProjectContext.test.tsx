// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import toast from "react-hot-toast";
import { ProjectProvider, useProject } from "./ProjectContext";

/**
 * Autosave runs 800 ms after the last change. These tests drive that timer by
 * hand and mock the persistence module, so the assertion is about what the user
 * is told — not about IndexedDB, which `persistence.test.ts` already covers.
 */
vi.mock("../lib/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/persistence")>();
  return { ...actual, saveProject: vi.fn() };
});

/** A harmless edit: autosave only re-runs when the state actually changes. */
function Nudge() {
  const { dispatch } = useProject();
  return <button onClick={() => dispatch({ type: "SET_BLEED", value: 4 })}>ubah</button>;
}

const { saveProject } = await import("../lib/persistence");
const saveMock = vi.mocked(saveProject);

const AUTOSAVE_MS = 800;

/** Lets the debounce fire and the promise chain behind it settle. */
async function flushAutosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset();
  saveMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  toast.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("autosave warning", () => {
  it("says nothing while saving works", async () => {
    const errorSpy = vi.spyOn(toast, "error");
    render(
      <ProjectProvider>
        <div />
      </ProjectProvider>
    );
    await flushAutosave();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("warns that the work will not survive a reload when the store is full", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "quota" });
    const errorSpy = vi.spyOn(toast, "error");
    render(
      <ProjectProvider>
        <div />
      </ProjectProvider>
    );
    await flushAutosave();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, options] = errorSpy.mock.calls[0];
    expect(message).toContain("penyimpanan perangkat penuh");
    expect(message).toContain("di-reload");
    // Short, self-dismissing, and reusing one id so a retry loop cannot stack.
    expect(options).toMatchObject({ id: "autosave-failed", duration: 5000 });
  });

  it("names a blocked store differently from a full one", async () => {
    saveMock.mockResolvedValue({ ok: false, reason: "blocked" });
    const errorSpy = vi.spyOn(toast, "error");
    render(
      <ProjectProvider>
        <div />
      </ProjectProvider>
    );
    await flushAutosave();
    expect(errorSpy.mock.calls[0][0]).toContain("diblokir");
  });

  it("clears the warning once a later save succeeds", async () => {
    saveMock.mockResolvedValueOnce({ ok: false, reason: "unknown" });
    const dismissSpy = vi.spyOn(toast, "dismiss");
    render(
      <ProjectProvider>
        <Nudge />
      </ProjectProvider>
    );
    await flushAutosave();
    expect(dismissSpy).not.toHaveBeenCalledWith("autosave-failed");

    saveMock.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByText("ubah"));
    await flushAutosave();
    expect(dismissSpy).toHaveBeenCalledWith("autosave-failed");
  });
});
