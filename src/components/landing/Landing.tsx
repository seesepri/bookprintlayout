import { useRef } from "react";
import {
  BookOpen,
  BookCopy,
  Layers,
  ScanLine,
  Ruler,
  ImageDown,
  ScissorsLineDashed,
  Eye,
  UploadCloud,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useProjectActions } from "../../state/ProjectContext";
import { handleFileUpload } from "../../lib/uploadHandler";
import { useProject } from "../../state/ProjectContext";
import toast from "react-hot-toast";

const FEATURES = [
  {
    icon: BookCopy,
    title: "Auto Booklet Layout",
    desc: "Susun ulang halaman secara otomatis menjadi format booklet siap lipat.",
  },
  {
    icon: Layers,
    title: "PDF Imposition",
    desc: "Algoritma imposition profesional untuk saddle stitch, perfect binding, dan signature.",
  },
  {
    icon: ScanLine,
    title: "Print Ready PDF",
    desc: "Hasil akhir lengkap dengan crop mark, bleed, dan registration mark.",
  },
  {
    icon: BookOpen,
    title: "Signature Generator",
    desc: "Bagi buku tebal menjadi beberapa signature (4/8/16/24/32 halaman).",
  },
  {
    icon: Ruler,
    title: "Custom Paper Size",
    desc: "Dukungan ukuran kertas A4, A3, A2, F4, SRA3 hingga ukuran kustom.",
  },
  {
    icon: ScissorsLineDashed,
    title: "Crop Mark & Bleed",
    desc: "Kontrol penuh atas bleed, safe area, gutter, dan tanda potong.",
  },
  {
    icon: ImageDown,
    title: "Cover Layout",
    desc: "Generator cover otomatis lengkap dengan spine width & bleed.",
  },
  {
    icon: Eye,
    title: "Print Preview",
    desc: "Preview lembar cetak real-time dengan ruler dan grid presisi.",
  },
];

export default function Landing() {
  const { goWorkspace, setView } = useProjectActions();
  const { dispatch } = useProject();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
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
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Logo BookPrint Layout"
              className="h-9 w-9 rounded-xl object-cover shadow-sm"
            />
            <span className="text-lg font-bold tracking-tight">
              BookPrint <span className="text-indigo-600">Layout</span>
            </span>
          </div>
          <button
            onClick={() => {
              goWorkspace();
              setView("pages");
            }}
            className="hidden rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 md:inline-flex"
          >
            Buka Workspace
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-indigo-50/60 via-white to-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Professional Book <span className="text-indigo-600">Imposition</span> &amp; Print Layout Tool
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              BookPrint Layout membantu percetakan, desainer, penerbit, dan pengguna umum melakukan
              layout, imposition, dan persiapan file PDF buku sebelum proses cetak — otomatis, presisi, dan siap cetak.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
              >
                <UploadCloud className="h-4.5 w-4.5" />
                Upload PDF
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              <button
                onClick={() => {
                  goWorkspace();
                  setView("layout");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Mulai Layout
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-500">
              <div><span className="font-bold text-slate-900">100%</span> berjalan di browser</div>
              <div><span className="font-bold text-slate-900">Real</span> PDF imposition engine</div>
              <div><span className="font-bold text-slate-900">Booklet · Saddle Stitch · Perfect Binding</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="mb-10 flex items-center gap-2 text-indigo-600">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Kemampuan Utama</span>
          </div>
          <h2 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Dari PDF mentah sampai lembar siap cetak
          </h2>
          <p className="mb-10 max-w-2xl text-sm text-slate-500">
            Semua diproses di browser Anda — file tidak pernah diunggah ke server mana pun.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <article
                  key={f.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{f.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-8 py-16 text-center shadow-2xl">
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-indigo-600/30 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-violet-600/30 blur-3xl" />
          <h2 className="relative text-3xl font-bold text-white sm:text-4xl">Siap menyiapkan buku Anda untuk cetak?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-slate-300">
            Upload PDF sekarang dan biarkan BookPrint Layout menghitung imposition secara otomatis.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              <UploadCloud className="h-4.5 w-4.5" />
              Upload PDF Sekarang
            </button>
          </div>
        </div>
      </section>

      <footer id="faq" className="border-t border-slate-200 py-8 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} BookPrint Layout — Dibuat untuk kebutuhan prepress &amp; percetakan profesional.
      </footer>
    </div>
  );
}
