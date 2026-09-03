# BookPrint Layout

**Professional Book Imposition & Print Layout Tool** — aplikasi web untuk membantu percetakan,
desainer, penerbit, dan pengguna umum melakukan layout, imposition, dan persiapan file PDF buku
sebelum proses cetak.

## Alur Kerja

Upload PDF → Analisis Dokumen → Pilih Jenis Layout → Atur Ukuran Buku & Kertas → Generate
Imposition → Preview → Export PDF Siap Cetak.

## Arsitektur

Environment ini hanya menyediakan runtime frontend (React + Vite + TypeScript + Tailwind CSS),
sehingga seluruh mesin pemrosesan PDF (analisis, thumbnail, dan imposition) diimplementasikan
**100% berjalan di browser** menggunakan:

- **pdf.js (`pdfjs-dist`)** — membaca metadata PDF & merender thumbnail setiap halaman.
- **pdf-lib** — merakit ulang halaman menjadi lembar cetak (imposition), menggambar crop mark,
  bleed guide, fold mark, registration mark, dan menghasilkan cover layout, lalu menyimpannya
  sebagai file PDF baru yang bisa diunduh.

Pendekatan ini menggantikan kombinasi backend FastAPI/Node + PyMuPDF/pypdf/ReportLab yang
disebutkan pada spesifikasi awal, namun tetap menghasilkan **fungsi nyata** (bukan sekadar UI):
upload, analisis jumlah halaman, page management, perhitungan algoritma imposition, generate PDF,
dan download file semuanya benar-benar berjalan.

### Struktur Folder

```
src/
  components/
    landing/        Landing page
    workspace/       Dashboard 3-kolom (sidebar, preview canvas, settings panel)
      panels/        Panel pengaturan (Layout, Book, Print)
      views/         Halaman penuh (Project, Upload, Pages, Cover, Export)
  lib/
    imposition.ts    Algoritma inti: booklet order, signature split, creep
    pdfEngine.ts      Generator PDF (pdf-lib): imposition & cover
    pdfRender.ts      Rendering thumbnail (pdf.js)
    uploadHandler.ts  Analisis file upload
    paperSizes.ts     Preset ukuran kertas/buku & konversi satuan
    previewHelpers.ts Util orientasi kertas & resolusi thumbnail halaman
  state/
    ProjectContext.tsx  Global state (React Context + useReducer)
  types/               Definisi tipe TypeScript
```

## Fitur Utama (MVP + Lanjutan)

- Upload PDF & analisis otomatis (jumlah halaman, ukuran halaman, ukuran file)
- Page Management: drag & drop reorder, rotate, delete, duplicate, insert/replace blank page,
  "Add Blank Pages Automatically"
- Layout/Binding: Booklet, Saddle Stitch, Perfect Binding, Signature Imposition (4/8/16/24/32/custom)
- Book Size & Paper Size (A4/A5/A6/B5/Letter/Custom, A4/A3/A2/F4/SRA3/Custom) + orientasi
- Margin, Bleed, Safe Area, Gutter + toggle Crop Mark/Bleed/Safe Area/Fold Mark/Center Line
- Creep Compensation (auto/manual berdasarkan ketebalan kertas)
- Cover Generator (front/back/spine terpisah) dengan perhitungan lebar cover otomatis
- Preview real-time: Single/Spread/Grid view, zoom in/out, fit to screen, drag pan, ruler, fullscreen
- Export: pilihan format & kualitas, opsi crop mark/bleed/registration/compress/embed font,
  generate PDF siap cetak, preview hasil, dan download

## Algoritma Imposition (inti)

Contoh booklet 16 halaman menghasilkan urutan lembar:

```
Sheet 1 Front: 16 | 1     Back: 2 | 15
Sheet 2 Front: 14 | 3     Back: 4 | 13
Sheet 3 Front: 12 | 5     Back: 6 | 11
Sheet 4 Front: 10 | 7     Back: 8 | 9
```

Rumus umum (0-indexed sheet `i`, total halaman `N` setelah padding ke kelipatan 4):

```
frontLeft  = N - 2i
frontRight = 2i + 1
backLeft   = 2i + 2
backRight  = N - 2i - 1
```

Lihat `src/lib/imposition.ts` untuk implementasi lengkap termasuk signature splitting dan
perfect binding.
