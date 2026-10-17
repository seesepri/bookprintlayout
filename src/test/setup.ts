import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Testing Library only auto-cleans when a global `afterEach` exists, so DOM
 * from one test was still on `document.body` in the next (duplicate buttons,
 * two probes). Cleanup is registered here instead.
 */
afterEach(() => {
  cleanup();
});

// jsdom implements neither of these, and the app calls them on mount.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  }
}
