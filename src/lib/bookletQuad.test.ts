import { it, expect } from "vitest";
import { computeBookletSheets, computeBookletQuadSheets, padToMultiple } from "./imposition";
import { buildSheetGeometry } from "./geometry";
import type { PageInfo } from "../types";
const pages = (n: number): PageInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i+1}`, originalIndex: i, rotation: 0 as const, isBlank: false, widthPt: 419.53, heightPt: 595.28 }));
const MARKS = { showCropMarks: true, showBleedArea: false, showSafeArea: false, showFoldMarks: false, showCenterLine: false, showRegistrationMarks: false };
const PAPER = { width: 324, height: 484 }, BOOK = { width: 148, height: 210 };

it("membalik lipatan horizontal menghasilkan urutan 2-up yang persis sama", () => {
  for (const total of [8, 16, 24, 28, 32, 60]) {
    const padded = padToMultiple(total, 8);
    const base = computeBookletSheets(padded, 1, 0, "left");   // 2-up, sudah terbukti benar
    const quad = computeBookletQuadSheets(total, "left");
    expect(quad.length, `${total} halaman → lembar`).toBe(base.length / 2);
    for (let i = 0; i < quad.length; i++) {
      // Rencana menyimpan kiri/kanan secara logis (identik dengan sheet 2-up);
      // yang memutar baris atas adalah geometry, jadi di sini harus sama persis.
      const q = quad[i];
      expect(q.frontSlots, `sheet ${i} front`).toEqual([base[2*i].front.left, base[2*i].front.right, base[2*i+1].front.left, base[2*i+1].front.right]);
      expect(q.backSlots, `sheet ${i} back`).toEqual([base[2*i].back.left, base[2*i].back.right, base[2*i+1].back.left, base[2*i+1].back.right]);
    }
    // tiap halaman muncul tepat sekali
    const seen = quad.flatMap(s => [...s.frontSlots!, ...s.backSlots!]).filter((n): n is number => !!n);
    expect([...new Set(seen)].sort((a,b)=>a-b)).toEqual(Array.from({length: padded}, (_,i)=>i+1));
  }
});

it("baris atas miring 180 derajat, baris bawah tegak, dan keduanya nempel di garis lipatan", () => {
  const sheet = computeBookletQuadSheets(16, "left")[0];
  const g = buildSheetGeometry({ sheet, paper: PAPER, bookSize: BOOK, bleedMm: 0, gutterMm: 0, safeAreaMm: 5, binding: "saddle-stitch", pages: pages(16), marks: MARKS, grid: { cols: 2, rows: 2 } });
  const rows = (g.frontSlots ?? []).map(p => ({ rot: p.rotation, y: p.trim.y, x: p.trim.x }));
  expect(rows.slice(0, 2).every(r => r.rot === 180)).toBe(true);   // band yang melipat
  expect(rows.slice(2).every(r => r.rot === 0)).toBe(true);        // band diam
  // blok 420 mm di kertas 484 mm ter-center: bawah di 32, atas di 242
  expect(new Set(rows.map(r => r.y))).toEqual(new Set([32, 242]));
  // urutan cetak kolom terbalik untuk baris atas
  expect(rows[0].x).toBeGreaterThan(rows[1].x);
  expect(rows[2].x).toBeLessThan(rows[3].x);
  expect(g.foldX).toBeCloseTo((324 - 296) / 2 + 148, 6);           // tepat di tengah blok
});

it("auto tetap 2-up untuk binding lipatan; hanya 4 eksplisit yang menyalakan head-to-head", async () => {
  const { resolveSheetLayout } = await import("./previewHelpers");
  const base = { paper: PAPER, bookSize: BOOK, bleedMm: 0, gutterMm: 0, showCropMarks: true, binding: "saddle-stitch" as const };
  expect(resolveSheetLayout({ ...base, setting: "auto" }).slotsPerSide).toBe(2);
  const four = resolveSheetLayout({ ...base, setting: 4 });
  expect([four.slotsPerSide, four.headToHead]).toEqual([4, true]);
  expect(resolveSheetLayout({ ...base, binding: "signature", setting: 4 }).headToHead).toBe(false);
});
