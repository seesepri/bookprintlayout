import { useRef } from "react";
import {
  ArrowRight,
  BookCopy,
  BookImage,
  BookOpen,
  Crop,
  Eye,
  LayoutGrid,
  Printer,
  Ruler,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useProjectActions, useProjectDispatch } from "../../state/ProjectContext";
import { handleFileUpload, looksLikePdf } from "../../lib/uploadHandler";
import toast from "react-hot-toast";

/**
 * Cards and copy kept to a single line each: the landing page is a signpost, and
 * every extra clause made the eight cards read as a wall instead of a list.
 */
const FEATURES = [
  { icon: BookCopy, title: "Auto Booklet", desc: "Urutan halaman siap lipat." },
  { icon: LayoutGrid, title: "Imposition", desc: "Saddle, perfect, signature." },
  { icon: Printer, title: "Print Ready", desc: "Lengkap dengan marks." },
  { icon: BookOpen, title: "Signature", desc: "Pecah buku tebal otomatis." },
  { icon: Ruler, title: "Ukuran Kertas", desc: "A-series, F4, SRA3, custom." },
  { icon: Crop, title: "Crop & Bleed", desc: "Bleed, safe area, gutter." },
  { icon: BookImage, title: "Cover", desc: "Back, spine, front." },
  { icon: Eye, title: "Preview", desc: "Ruler & grid presisi." },
];

export default function Landing() {
  const { goWorkspace, setView } = useProjectActions();
  const dispatch = useProjectDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!looksLikePdf(file)) {
      toast.error("Mohon unggah file PDF.");
      return;
    }
    const toastId = toast.loading("Menganalisis PDF...");
    try {
      await handleFileUpload(file, dispatch, (done, total) => {
        toast.loading(`Menganalisis PDF — halaman ${done}/${total}`, { id: toastId });
      });
      toast.success("PDF berhasil dianalisis!", { id: toastId });
      goWorkspace();
      setView("pages");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Gagal membaca file PDF.", { id: toastId });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo seebook" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
            <span className="text-[15px] font-bold tracking-tight">seebook</span>
          </div>
          <button
            onClick={() => {
              goWorkspace();
              setView("pages");
            }}
            className="hidden rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-indigo-700 md:inline-flex"
          >
            Buka Workspace
          </button>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-gradient-to-b from-indigo-50/50 via-white to-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              <Sparkles className="h-3 w-3" /> 100% di browser
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Imposition buku, <span className="text-indigo-600">siap cetak</span>.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-600">
              Susun PDF jadi lembar cetak — booklet, saddle stitch, perfect binding. File tidak pernah keluar dari
              perangkat Anda.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <UploadCloud className="h-4 w-4" /> Upload PDF
              </button>
              <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} />
              <button
                onClick={() => {
                  goWorkspace();
                  setView("layout");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Mulai Layout <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 rounded-2xl bg-indigo-100/50 blur-2xl" />
            <div className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Lembar 1 / 8</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">
                  Booklet
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["16", "1", "2", "15"].map((n, i) => (
                  <div
                    key={i}
                    className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-2xl font-black text-slate-300"
                  >
                    {n}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
                <span>A4 · trim A5</span>
                <span>3 mm bleed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Dari PDF mentah ke lembar cetak</h2>
          <p className="mt-2 max-w-lg text-sm text-slate-500">
            Semua diproses di perangkat Anda — tidak ada file yang diunggah ke server.
          </p>
          <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <article
                  key={f.title}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-[13px] font-semibold">{f.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{f.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-xl bg-slate-900 px-6 py-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Siap cetak?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Upload PDF, imposition dihitung otomatis.
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            <UploadCloud className="h-4 w-4" /> Upload PDF
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} seebook — prepress &amp; percetakan.
      </footer>
    </div>
  );
}
