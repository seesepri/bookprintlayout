// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { initialState } from "../../state/ProjectContext";
import { renderWithProject, pagesOf, projectState } from "../../test/harness";
import Sidebar from "./Sidebar";

/**
 * Every entry into the workspace starts on the icon rail. The component keeps
 * that choice for the life of the page, so the tests have to reset it between
 * cases the same way a fresh page load would.
 */
beforeEach(async () => {
  const mod = await import("./Sidebar");
  // Re-importing does not reset module state, so close the rail through the UI
  // when a previous case left it open.
  const close = screen.queryByRole("button", { name: "Tutup sidebar" });
  if (close) fireEvent.click(close);
  void mod;
});

const expand = () => {
  const open = screen.queryByRole("button", { name: "Buka sidebar" });
  if (open) fireEvent.click(open);
};

describe("Sidebar", () => {
  it("starts as an icon rail: steps are reachable but unlabelled", () => {
    renderWithProject(<Sidebar />);
    expect(screen.getByRole("button", { name: "Buka sidebar" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Tutup sidebar" })).toBeNull();
    // The rail still shows every step — by tooltip name, not visible text.
    for (const label of ["Upload", "Halaman", "Layout", "Ukuran Buku", "Cetak", "Cover", "Ekspor"]) {
      expect(screen.getByTitle(label)).toBeDefined();
    }
  });

  it("switches view from the rail", () => {
    renderWithProject(<Sidebar />);
    fireEvent.click(screen.getByTitle("Ekspor"));
    expect(screen.getByTestId("probe").getAttribute("data-view")).toBe("export");
  });

  it("opens into labelled mode and closes again from the header", () => {
    renderWithProject(<Sidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Buka sidebar" }));
    for (const label of ["Upload", "Halaman", "Layout", "Ukuran Buku", "Cetak", "Cover", "Ekspor"]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
    fireEvent.click(screen.getByRole("button", { name: "Tutup sidebar" }));
    expect(screen.getByRole("button", { name: "Buka sidebar" })).toBeDefined();
    // The rail keeps the button (named by its tooltip) but drops the visible label.
    expect(screen.queryByText("Ekspor")).toBeNull();
    expect(screen.getByTitle("Ekspor")).toBeDefined();
  });

  it("leaves exactly one toggle once open, with the logo as plain branding", () => {
    renderWithProject(<Sidebar />);
    expect(screen.getAllByRole("button", { name: /sidebar/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Buka sidebar" }));
    expect(screen.getAllByRole("button", { name: /sidebar/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Tutup sidebar" })).toBeDefined();
    expect(screen.getByRole("img", { name: "seebook" })).toBeDefined();
  });

  it("only offers to start over while there is work to lose", () => {
    renderWithProject(<Sidebar />, projectState({ pages: [] }));
    expand();
    expect(screen.queryByText("Proyek Baru")).toBeNull();
  });

  it("shows the way out once a project exists", () => {
    renderWithProject(<Sidebar />, projectState({ pages: pagesOf(5) }));
    expand();
    expect(screen.getByText("Proyek Baru")).toBeDefined();
  });

  it("keeps the project when the user backs out of the confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);
    renderWithProject(<Sidebar />, projectState({ pages: pagesOf(5) }));
    expand();
    fireEvent.click(screen.getByText("Proyek Baru"));
    expect(screen.getByTestId("probe").getAttribute("data-pages")).toBe("5");
    confirmSpy.mockRestore();
  });

  it("clears pages and settings once confirmed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    renderWithProject(<Sidebar />, projectState({ pages: pagesOf(5), bleedMm: 12 }));
    expand();
    fireEvent.click(screen.getByText("Proyek Baru"));
    const probe = screen.getByTestId("probe");
    expect(probe.getAttribute("data-pages")).toBe("0");
    expect(probe.getAttribute("data-bleed")).toBe(String(initialState.bleedMm));
    confirmSpy.mockRestore();
  });
});
