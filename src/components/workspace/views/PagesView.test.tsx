// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProject, pagesOf, projectState } from "../../../test/harness";
import PagesView from "./PagesView";

describe("PagesView padding", () => {
  it("adds exactly the pages the plan is missing", () => {
    // 10 pages with saddle stitch pads to a multiple of 4, so 2 blanks.
    renderWithProject(<PagesView />, projectState({ pages: pagesOf(10), binding: "saddle-stitch" }));
    fireEvent.click(screen.getByRole("button", { name: /Lengkapi 2 halaman/ }));
    const probe = screen.getByTestId("probe");
    expect(probe.getAttribute("data-pages")).toBe("12");
    expect(probe.getAttribute("data-blanks")).toBe("2");
  });

  it("sizes a new blank to the book instead of a hardcoded A5", () => {
    renderWithProject(
      <PagesView />,
      projectState({ pages: pagesOf(10), binding: "saddle-stitch", bookSizePreset: "A5" })
    );
    fireEvent.click(screen.getByRole("button", { name: /Lengkapi 2 halaman/ }));
    const expected = (148 * 72) / 25.4; // A5 trim width in points
    expect(parseFloat(screen.getByTestId("probe").getAttribute("data-blankw")!)).toBeCloseTo(expected, 1);
  });

  it("stays hidden when the page count already fits", () => {
    renderWithProject(<PagesView />, projectState({ pages: pagesOf(12), binding: "saddle-stitch" }));
    expect(screen.queryByRole("button", { name: /Lengkapi/ })).toBeNull();
  });

  it("pads each signature of a multi-signature book on its own", () => {
    // 10 pages split into 8-page signatures: 8 + 2 -> the second form needs 2
    // more, so the book ends at 12 with the first signature untouched.
    renderWithProject(
      <PagesView />,
      projectState({ pages: pagesOf(10), binding: "signature", signatureSize: 8 })
    );
    fireEvent.click(screen.getByRole("button", { name: /Lengkapi 2 halaman/ }));
    expect(screen.getByTestId("probe").getAttribute("data-pages")).toBe("12");
  });
});
