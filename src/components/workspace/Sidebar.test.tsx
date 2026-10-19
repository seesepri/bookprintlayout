// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { initialState } from "../../state/ProjectContext";
import { renderWithProject, pagesOf, projectState } from "../../test/harness";
import Sidebar from "./Sidebar";

describe("Sidebar", () => {
  it("lists every workspace step and switches view on click", () => {
    renderWithProject(<Sidebar />);
    for (const label of ["Upload", "Halaman", "Layout", "Ukuran Buku", "Cetak", "Cover", "Ekspor"]) {
      // By role and exact name: the brand wordmark also contains "Layout".
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
    fireEvent.click(screen.getByRole("button", { name: "Ekspor" }));
    expect(screen.getByTestId("probe").getAttribute("data-view")).toBe("export");
  });

  it("only offers to start over while there is work to lose", () => {
    renderWithProject(<Sidebar />, projectState({ pages: [] }));
    expect(screen.queryByText("Proyek Baru")).toBeNull();
  });

  it("shows the way out once a project exists", () => {
    renderWithProject(<Sidebar />, projectState({ pages: pagesOf(5) }));
    expect(screen.getByText("Proyek Baru")).toBeDefined();
  });

  it("keeps the project when the user backs out of the confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);
    renderWithProject(<Sidebar />, projectState({ pages: pagesOf(5) }));
    fireEvent.click(screen.getByText("Proyek Baru"));
    expect(screen.getByTestId("probe").getAttribute("data-pages")).toBe("5");
    confirmSpy.mockRestore();
  });

  it("clears pages and settings once confirmed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    renderWithProject(<Sidebar />, projectState({ pages: pagesOf(5), bleedMm: 12 }));
    fireEvent.click(screen.getByText("Proyek Baru"));
    const probe = screen.getByTestId("probe");
    expect(probe.getAttribute("data-pages")).toBe("0");
    expect(probe.getAttribute("data-bleed")).toBe(String(initialState.bleedMm));
    confirmSpy.mockRestore();
  });
});
