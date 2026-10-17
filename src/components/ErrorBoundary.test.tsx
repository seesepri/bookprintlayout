// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const clearProject = vi.fn(() => Promise.resolve());
vi.mock("../lib/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/persistence")>()),
  clearProject: () => clearProject(),
}));

/** A child that fails until the test tells it to stop, like a flaky canvas. */
function makeFragile() {
  let failing = true;
  return {
    recover: () => {
      failing = false;
    },
    Fragile: () => {
      if (failing) throw new Error("canvas meledak");
      return <p>preview hidup lagi</p>;
    },
  };
}

const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("shows a readable failure instead of a blank page", () => {
    const spy = silence();
    const { Fragile } = makeFragile();
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>
    );
    expect(screen.getByText("Terjadi kesalahan")).toBeDefined();
    expect(screen.getByText(/canvas meledak/)).toBeDefined();
    expect(spy).toHaveBeenCalled();
  });

  it("resumes the same tree without wiping the autosaved project", () => {
    silence();
    const { Fragile, recover } = makeFragile();
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>
    );
    recover();
    fireEvent.click(screen.getByText("Coba lanjutkan"));
    expect(screen.getByText("preview hidup lagi")).toBeDefined();
    expect(screen.queryByText("Terjadi kesalahan")).toBeNull();
    expect(clearProject).not.toHaveBeenCalled();
  });

  it("offers to discard the save, which is what unblocks a crash on boot", () => {
    silence();
    const { Fragile } = makeFragile();
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText(/hapus proyek tersimpan/));
    expect(clearProject).toHaveBeenCalledTimes(1);
  });
});
