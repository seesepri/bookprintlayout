# BookPrint Layout

**Professional Book Imposition & Print Layout Tool** — aplikasi web untuk membantu percetakan,
desainer, penerbit, dan pengguna umum melakukan layout, imposition, dan persiapan file PDF buku
sebelum proses cetak.

> Semua pemrosesan terjadi di browser Anda. File PDF tidak pernah dikirim ke server mana pun.

## ⚙️ Setting cetak yang wajib diperhatikan

Hasil export adalah **lembar spread landscape** (2 halaman buku berdampingan per sisi). Saat
mengeprint, pilih:

```
Duplex: Flip on SHORT EDGE        (bukan long edge)
Page scaling: None / Actual size  (jangan "fit to page")
```

Sisi belakang lembar ditata untuk balik pada sumbu vertikal (sejajar garis lipat). Salah pilih
"flip on long edge" membuat setiap halaman jatuh di belakang pasangan yang salah — seluruh cetakan
rusak dan tidak bisa diselamatkan. Kedua preferensi ini juga ditulis ke dalam file PDF sebagai
`/ViewerPreferences << /Duplex /DuplexFlipShortEdge /PrintScaling /None >>`, tapi **jangan
mengandalkannya**: tidak semua driver/print dialog membaca metadata itu.

## Alur Kerja

Upload PDF → Analisis Dokumen → Pilih Jenis Layout → Atur Ukuran Buku & Kertas → Generate
Imposition → Preview → Export PDF Siap Cetak. Semua langkah di atas tersimpan otomatis
di browser, jadi tab yang crash atau tidak sengaja di-refresh bisa dilanjutkan.

## Arsitektur

Repo ini hanya menyediakan runtime frontend (React + Vite + TypeScript + Tailwind CSS), sehingga
seluruh mesin pemrosesan PDF (analisis, thumbnail, dan imposition) diimplementasikan
**100% berjalan di browser** menggunakan:

- **pdf.js (`pdfjs-dist`)** — membaca metadata PDF & merender thumbnail setiap halaman.
- **pdf-lib** — merakit ulang halaman menjadi lembar cetak (imposition), menggambar crop mark,
  bleed guide, fold mark, center line, registration mark, halaman pembatas antar-signature, dan
  cover layout, lalu menyimpannya sebagai PDF baru.

Pendekatan ini menggantikan kombinasi backend FastAPI/Node + PyMuPDF/pypdf/ReportLab yang
disebutkan pada spesifikasi awal. Konsekuensi yang perlu diketahui: tidak ada color management
ICC, tidak ada flattening/transparency handling, dan tidak ada preflight PDF/X — output cocok
untuk percetakan digital & offset sederhana, bukan untuk workgroup prepress yang menuntut PDF/X-4.

### Struktur Folder

```
src/
  components/
    landing/          Landing page (hero + 8 kartu fitur)
    workspace/        Dashboard 3-kolom (sidebar, preview canvas, settings panel)
      panels/         Panel pengaturan (Layout, Book, Print)
      views/          Halaman penuh (Upload, Pages, Cover, Export)
  lib/
    imposition.ts     Algoritma inti: booklet order, perfect binding, signature split, creep
    geometry.ts       Perhitungan mm (trim/bleed/safe/crop mark) + validasi
    exportOptions.ts  SATU sumber kebenaran: user settings -> opsi yang dipakai validasi & build
    plan.ts           Rencana cetak untuk UI (padding/blank/creep) — resolver yang sama dengan engine
    pdfEngine.ts      Generator PDF (pdf-lib): imposition, divider, cover, print intent
    pdfRender.ts      Rendering thumbnail (pdf.js) + lifecycle dokumen
    uploadHandler.ts  Analisis file upload (progressif, ada batasnya)
    paperSizes.ts     Preset ukuran kertas/buku, konversi satuan, parse input angka
    previewHelpers.ts Util orientasi kertas & lookup thumbnail
    theme.ts          Dark mode (class `.dark` yang dipakai index.css)
  state/
    ProjectContext.tsx  Global state (React Context + useReducer + undo)
  types/                Definisi tipe TypeScript
```

`src/lib/*` sengaja dijaga tetap murni (tanpa React, tanpa DOM) supaya bisa di-unit test di
Node — lihat `src/lib/*.test.ts`.

## Fitur

### Yang berfungsi penuh

- **Upload PDF & analisis otomatis** — jumlah halaman, ukuran halaman per halaman, ukuran file.
  Render thumbnail berjalan bertahap dengan progress dan tidak membekukan tab; di atas
  `MAX_THUMBNAIL_PAGES` (400) halaman tetap masuk ke imposition, hanya preview-nya yang jadi
  placeholder bernomor. Upload dibatasi 150 MB. Deteksi file tidak bergantung pada MIME: PDF dari
  share sheet Android sering datang dengan `file.type` kosong atau `application/octet-stream`, jadi
  tipe yang tidak informatif jatuh ke ekstensi `.pdf`, sedangkan tipe yang jelas menyebut keluarga
  lain (gambar/audio/teks) tetap ditolak di depan.
- **Page Management** — drag & drop reorder, rotate 90°, delete, duplicate, insert blank,
  replace dari nomor halaman lain atau jadi blank. Tombol **Lengkapi N halaman** menambahkan
  halaman kosong di akhir sampai pas dengan ukuran signature — kalau tidak ditekan pun engine
  tetap mem-padding secara virtual, jadi ini hanya untuk kasus file-nya sendiri yang harus genap.
- **Layout / Binding** — Booklet, Saddle Stitch, Perfect Binding, Signature Imposition
  (4/8/16/24/32/custom).
- **Book Size & Paper Size** — A4/A5/A6/B5/Letter + A4/A3/A2/F4/SRA3, semua bisa Custom,
  plus orientasi (auto/portrait/landscape). **Auto** mencoba kedua orientasi dan memilih yang
  benar-benar memuat grid terpadat: SRA3 + A5 otomatis jadi 4-up di portrait, bukan 2-up di
  landscape. Kalau kedua orientasi menghasilkan kepadatan yang sama, pilihan lamalah yang dipakai,
  jadi proyek yang sudah ada tidak berubah kertasnya.
- **Bleed, Safe Area, Gutter** dan toggle **Crop Mark / Bleed Area / Safe Area / Fold Mark /
  Center Line / Registration Mark** — keenamnya benar-benar digambar ke PDF, dan preview
  menunjukkan apa yang akan tercetak.
- **Creep Compensation** — auto (dari ketebalan kertas) atau manual, dihitung **per signature**
  karena tiap signature dilipat sendiri.
- **Cover Generator** — back | spine | front dalam satu lembar, bleed per sisi, crop mark yang
  otomatis mengecil kalau bleed nol. Artwork mengikuti aturan yang sama dengan halaman interior:
  **lebih besar dari trim = punya bleed sendiri → di-fit ke bleed box** (tidak diperkecil ke trim),
  sedangkan artwork seukuran trim di-fit ke trim. Bleed hanya di sisi luar cover; tepi yang
  berbatasan dengan spine adalah lipatan, jadi artwork yang punya bleed di keempat sisi akan
  kehilangan 3 mm di sisi dalam itu (98 % skala) dan tetap menutup trim + bleed luar tanpa tepi
  putih. Panel menampilkan catatan kalau artwork tidak membawa bleed, atau kalau file yang diunggah
  punya lebih dari satu halaman (hanya halaman 1 yang dipakai per slot). File cover **tidak ikut
  tersimpan otomatis** — hanya pengaturan spine/bleed yang tersimpan, dan UI menyebutkannya.
  Lebar spine bisa diisi manual atau **dihitung otomatis**
  (`lembar × ketebalan kertas`, dikali 0,9 untuk compress lem perfect binding) dari
  *Print Settings → ketebalan kertas* — tetap estimasi, bukan pengganti kaliper di kertas
  cetak sebenarnya.
- **Preview** — mode Spread (navigator sheet + front/back) dan Grid, zoom, fit to screen, drag
  pan, ruler mm, fullscreen.
- **Export** — tiga format nyata (lihat bawah), `compress` nyata, preview hasil di iframe, unduh.

### Tiga format export — sekarang beda, dulu cuma label

| Format | Isi file |
|---|---|
| **PDF Print Ready** | Semua lembar + marks + bleed, siap kirim ke mesin cetak |
| **PDF Preview** | Tanpa marks, artwork pas di trim (bukan bleed) — buat approval klien |
| **PDF Per Signature** | Sama seperti print-ready + **1 halaman pembatas bertuliskan nomor signature, rentang halaman, dan jumlah lembar** di awal tiap signature, agar bisa dipecah manual per signature. Ada opsi **satu file per signature dibungkus ZIP** untuk mesin cetak yang menerima tiap form sebagai berkas sendiri; pemisahnya memakai rencana lembar yang sama, dan kalau jumlah halaman hasilnya tidak cocok dengan rencana, ZIP dibatalkan dan file tetap utuh (tidak pernah menebak titik potong) |

`Compress PDF (object streams)` mengaktifkan `useObjectStreams` pada saat save (terukur pada contoh 16 halaman
bermarks: 15.871 B vs 18.596 B, hemat ±15%).

Opsi `quality` (Standard/High/Print) dan `embedFonts` **sudah dihapus** dari UI: keduanya tidak
punya efek pada mesin. Yang satu tidak bisa disediakan jujur oleh `pdf-lib` di browser, yang
lain tidak berarti apa-apa karena artwork masuk sebagai form XObject (font sudah ikut sumbernya).

## Batas yang perlu diketahui (bukan bug, tapi perlu tahu)

- **Perfect binding** kini duplex (2 halaman depan + 2 halaman belakang per lembar); buku 10
  halaman = 5 sisi cetak. Kalau percetakan Anda memang menata perfect binding dari lembar
  satu-sisi, matikan duplex di driver — filenya sudah berurutan benar.
- Halaman sumber yang **lebih besar** dari trim di-fit ke bleed box; yang lebih kecil di-fit ke
  trim. Skala selalu seragam (rasio tidak pernah dilanggar), jadi kalau ukuran halaman sumber
  tidak sama dengan ukuran buku, hasilmu bisa berbingkai putih. Validator memberi *warning* untuk
  ini, bukan error.
- Ukuran halaman sumber yang tidak seragam: didukung, tapi setiap halaman boleh punya skala
  berbeda (ada warning di panel Export).
- Tidak ada color management / soft proofing; semua warna adalah RGB `pdf-lib`, bukan CMYK.

## Rumus Imposition (inti)

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

Padding selalu **virtual**: slot tambahan tidak menjadi `PageInfo`, tidak menggeser halaman user,
dan dirender sebagai halaman kosong.

Perfect binding memakai pola `front = 4i+1 | 4i+2`, `back = 4i+3 | 4i+4` (lembar ditumpuk, bukan
dilipat). Target padding adalah **halaman per lembar fisik**: kelipatan 4 untuk spread 2-up,
kelipatan **8** untuk lembar 4-up (2×2), karena satu lembar 4-up membawa dua spread. Angka yang
dipakai UI (tombol *Lengkapi N halaman*, ringkasan padding, estimasi creep) dan yang dipakai engine
berasal dari satu resolver yang sama — `resolvePrintPlan()` di `src/lib/plan.ts` — jadi tidak
mungkin lagi berbeda.

Implementasi + penjelasannya ada di `src/lib/imposition.ts`; invariannya ("setiap halaman asli
muncul tepat satu kali") dikunci oleh test di `src/lib/imposition.test.ts` dan
`src/lib/geometry.test.ts` untuk semua binding dan panjang 1–40.

## Development

```bash
npm install
npm run dev         # vite dev server
npm run typecheck   # tsc --noEmit
npm test            # vitest run — src/lib di Node, komponen di jsdom
npm run build       # typecheck && vite build  -> dist/index.html
npm run preview     # serve hasil build
```

Build menghasilkan **satu file** `dist/index.html` (~3,56 MB, ±925 KB gzip; `gzip -c` =
920.886 B) karena `vite-plugin-singlefile` meng-inline JS, CSS, dan worker pdf.js. Worker
di-inline sebagai string lalu dijadikan Blob URL saat runtime supaya tetap jalan di mode
single-file.

### Bundler: Vite 8 = Rolldown, bukan Rollup

Vite 8 memindah bundler ke Rolldown + oxc. Yang perlu lo tahu waktu ngutak-atik build:

- **Floor browser sekarang nempel di `build.target`, bukan di nama browser.** `vite.config.ts`
  mem-pin `target: "es2020"`. Kalau dibiarkan default (`"baseline-widely-available"`), floor-nya
  ikut maju tiap rilis Vite — bundle mengecil 10,4 KB, tapi browser yang bisa buka app ikut
  berubah tanpa ada yang mutusin itu di repo.
- **`build.target: "chrome107,firefox104,safari16"` diterima tipe lalu DIABAIKAN diam-diam.**
  Sudah diuji: jumlah class field privat yang diturunkan identik dengan build default (220 vs
  221), sedangkan `es2020` menurunkan ke 119. Jadi kalau butuh floor, pakai `esNNNN`.
- **Praktis:** `npm run build` sekarang ±1,3 detik (Vite 7 ±6-7 detik, diukur di mesin yang sama).
  Config lama tetap kebaca: `build.rollupOptions` di Vite 8 adalah **alias yang sudah
  di-deprecated** untuk `build.rolldownOptions` dengan bentuk yang sama, jadi dia nggak hilang —
  tapi jangan nulis yang baru di situ. Yang nggak bisa lagi: `output.format`, `output.sourcemap`,
  `output.dir`, `output.banner` (dikecualikan dari tipenya), dan `commonjsOptions` sekarang no-op.

`typecheck` sengaja dijalankan lebih dulu oleh `build`: Vite hanya membuang annotation tipe, tidak
memeriksanya, jadi tanpa ini repo bisa "build sukses" dalam keadaan rusak tipe.

Node **22.22.2 ke atas** (atau 24.15+/26+) diperlukan. `engines` di package.json menyalin rentang
`jsdom@30`, yang paling mengikat di antara dependensi — `pdfjs-dist@6` hanya minta &ge;22.13 dan
Vite 8 minta ^20.19 || &ge;22.12 — sama seperti Vite 7, jadi naiknya bundler tidak ikut naikin
floor. Batas ditulis seketat itu supaya salah versi Node kelihatan waktu `npm ci`, bukan sebagai
empat berkas tes yang diam-diam tidak jalan.

Sebagian besar dependensi dipin presisi; `lucide-react`, `react-hot-toast`, dan `pdf-lib` memakai
rentang `^` — `package-lock.json` yang mengunci versinya, jadi `npm ci` tetap replikabel.

Test dibagi dua lingkungan lewat pragma per berkas: `src/lib/*.test.ts` jalan di Node murni
(engine geometri/imposition/export tidak butuh DOM), sedangkan `*.test.tsx` pakai
`// @vitest-environment jsdom`. Komponen yang diuji selalu lewat `ProjectProvider` asli
(`src/test/harness.tsx`, memakai jalur `HYDRATE` yang sama dengan resume autosave), jadi
yang dites adalah aplikasi, bukan tiruan state-nya.

CI menolak kalau: typecheck gagal, salah satu test gagal, `npm audit --omit=dev` menemukan
high, atau gzip `dist/index.html` lewat dari 1.1 MB (pagar supaya dependensi baru tidak
senyap-senyap menggembungkan berkas yang di-download user). Dependabot menaikkan patch/minor
npm tiap Senin dalam satu PR gabungan, dan actions per bulan.

### Deploy (Cloudflare)

```bash
npm run deploy      # build lalu npx wrangler deploy

# cek konfigurasi & isi dist tanpa mengunggah apa pun (tidak butuh login)
npx --yes wrangler@4 deploy --dry-run --outdir /tmp/wrangler-dry
```

`wrangler` tidak dipasang sebagai dependency; `npx` akan mengambilnya. Pin versinya di
`devDependencies` kalau Anda butuh build yang reproducible. `wrangler.json` menyajikan `dist/`
sebagai static assets.

### Menaikkan pdf.js

`pdfjs-dist` dipin ke **6.4.299**, dan pin itu tidak boleh turun di bawah **6.2.108** — versi
terakhir yang menambal CVE-2026-16633 (JavaScript di dalam PDF bisa dieksekusi saat file dibuka —
dan dokumen buatan orang lain adalah input utama aplikasi ini). pdf.js 6 menghapus `PDFScriptingManager` dari core,
jadi tidak ada lagi `enableScripting` untuk dimatikan: kemampuannya memang hilang.

Catatan kalau Anda turun ke 5.x atau naik major lagi:
- jangan pernah pakai `npm audit fix --force` untuk masalah ini (dia menawarkan *downgrade* ke
  5.5.207, yang tidak ditambal, dan memaksa `vite-plugin-singlefile` mundur ke 0.9.0);
- kalau terpaksa stay di 5.x, wajib `enableScripting: false` di `getDocument` **dan** CSP
  `script-src` yang ketat — lihat komentar di `src/lib/pdfRender.ts`;
- pdf.js 6 memindahkan `destroy()` dari document ke loading task (`pdfRender.ts` sudah mengikuti).

## Keamanan

- Semua parsing terjadi di perangkat user; tidak ada endpoint yang bisa disalahgunakan.
- PDF yang di-render bisa jadi berbahaya — karena itu dependency parser-nya dipin dan
  `npm audit --omit=dev --audit-level=high` dijaga di CI (`.github/workflows/ci.yml`).
- Kalau aplikasi ini di-host untuk publik, tambahkan CSP di `index.html`. Dengan
  `vite-plugin-singlefile` itu berarti butuh hash/nonce, atau melepaskan plugin tersebut supaya
  JS/CSS menjadi file terpisah (sekalian memangkas ukuran HTML awal).
- `npm audit --omit=dev` bersih. `npm audit` masih menampilkan 3 high **di rantai build saja**
  (`braces` → `micromatch` → `vite-plugin-singlefile`); tidak ada patch non-breaking, dan tidak ada
  satu byte pun dari ketiganya yang masuk ke `dist/`. Melepas `vite-plugin-singlefile` akan
  menghapusnya sekalian — pilihan sadar kalau Anda lebih suka HTML kecil + CSP ketat daripada
  satu file portabel.

## Lisensi

MIT — lihat [LICENSE](./LICENSE).
