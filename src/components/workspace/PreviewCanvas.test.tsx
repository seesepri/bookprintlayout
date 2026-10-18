// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import PreviewCanvas from "./PreviewCanvas";
import { renderWithProject, projectState } from "../../test/harness";
import type { PageInfo } from "../../types";

// The hi-res re-render needs pdf.js; the canvas must lay out fine without it.
vi.mock("../../lib/pdfRender", () => ({
  getSharedRenderDoc: vi.fn(() => Promise.reject(new Error("no pdf.js in tests"))),
  renderPageThumbnail: vi.fn(),
}));

const pagesWithThumb = (count: number): PageInfo[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    originalIndex: i + 1,
    rotation: 0 as const,
    isBlank: false,
    widthPt: 419.53,
    heightPt: 595.28,
    thumbnail: "data:,",
  }));

const A5 = { width: 148, height: 210 };
const A3_PORTRAIT = { width: 297, height: 420 };

const alts = () => screen.getAllByAltText(/^page-/).map((el) => el.getAttribute("alt"));

describe("PreviewCanvas sheet layout", () => {
  it("lays out 4 A5 pages on an A3 portrait sheet when the binding is glued", async () => {
    renderWithProject(
      <PreviewCanvas />,
      projectState({
        pages: pagesWithThumb(16),
        binding: "perfect-binding",
        bookSizePreset: "A5",
        bookSizeCustom: A5,
        paperSizePreset: "A3",
        paperSizeCustom: A3_PORTRAIT,
        orientation: "portrait",
        bleedMm: 0,
        gutterMm: 0,
      })
    );
    await waitFor(() => expect(alts()).toEqual(["page-1", "page-2", "page-3", "page-4"]));
  });

  it("keeps the classic two-page spread on a folded binding", async () => {
    renderWithProject(
      <PreviewCanvas />,
      projectState({
        pages: pagesWithThumb(16),
        binding: "booklet",
        bookSizePreset: "A5",
        bookSizeCustom: A5,
        paperSizePreset: "A3",
        paperSizeCustom: A3_PORTRAIT,
        orientation: "portrait",
        bleedMm: 0,
        gutterMm: 0,
      })
    );
    await waitFor(() => expect(alts()).toEqual(["page-16", "page-1"]));
  });

  it("drops back to a spread when the user asks for 2 per side", async () => {
    renderWithProject(
      <PreviewCanvas />,
      projectState({
        pages: pagesWithThumb(16),
        binding: "perfect-binding",
        pagesPerSide: 2,
        bookSizePreset: "A5",
        bookSizeCustom: A5,
        paperSizePreset: "A3",
        paperSizeCustom: A3_PORTRAIT,
        orientation: "portrait",
        bleedMm: 0,
        gutterMm: 0,
      })
    );
    await waitFor(() => expect(alts()).toEqual(["page-1", "page-2"]));
  });
});
