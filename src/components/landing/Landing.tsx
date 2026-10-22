import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookCopy, BookImage, BookOpen, Crop, Eye, LayoutGrid, Printer, Ruler, UploadCloud } from "lucide-react";
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

/**
 * True when the visitor asked the OS to cut motion. Every animated element here
 * degrades to its final state instead of animating, so the page is complete
 * either way — vestibular disorders make entrance animations genuinely unpleasant,
 * and this is a page people open repeatedly.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Reveals an element the first time it scrolls into view. The observer disconnects
 * after the first hit: re-animating on every pass makes a long page feel restless
 * when scrolling back up.
 */
function useReveal<T extends HTMLElement>(reduced: boolean) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);
  return { ref, shown };
}

/** Stage delays, so the hero builds up instead of appearing all at once. */
const step = (index: number, reduced: boolean) =>
  reduced
    ? undefined
    : { animation: "seebook-rise 760ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${index * 80}ms` };

export default function Landing() {
  const { goWorkspace, setView } = useProjectActions();
  const dispatch = useProjectDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = usePrefersReducedMotion();

  // Pointer offset, used for a small parallax on the proof card. Written to CSS
  // variables rather than state so moving the mouse never re-renders the tree.
  const heroRef = useRef<HTMLDivElement>(null);
  const onHeroMove = (e: React.MouseEvent) => {
    if (reduced) return;
    const box = heroRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    heroRef.current?.style.setProperty("--shift-x", `${(x * 10).toFixed(1)}px`);
    heroRef.current?.style.setProperty("--shift-y", `${(y * 8).toFixed(1)}px`);
  };
  const onHeroLeave = () => {
    heroRef.current?.style.setProperty("--shift-x", "0px");
    heroRef.current?.style.setProperty("--shift-y", "0px");
  };

  const features = useReveal<HTMLDivElement>(reduced);
  const closing = useReveal<HTMLDivElement>(reduced);

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

  const openWorkspace = () => {
    goWorkspace();
    setView("pages");
  };

  return (
        <div
      className="h-screen overflow-y-auto overflow-x-hidden scroll-smooth bg-white text-slate-900"
      // `html, body` are `overflow: hidden` so the workspace can own its own
      // scrolling. Nothing gave the landing a scroller, so on any viewport
      // shorter than the page the cards below the fold, the closing CTA and the
      // footer were simply unreachable — no scrollbar, no way to get there.
    >
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Logo seebook" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
            <span className="text-[15px] font-bold tracking-tight">seebook</span>
          </div>
          <button
            onClick={openWorkspace}
            className="hidden rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-indigo-700 md:inline-flex"
          >
            Buka Workspace
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-indigo-50/60 via-white to-white">
        <div
          ref={heroRef}
          onMouseMove={onHeroMove}
          onMouseLeave={onHeroLeave}
          className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-16 lg:grid-cols-2 lg:py-24"
        >
          <div>
            <span
              style={step(0, reduced)}
              className="inline-flex rounded-full border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-600"
            >
              100% di browser
            </span>
            <h1
              style={step(1, reduced)}
              className="display-title hero-title mt-5 text-4xl font-extrabold sm:text-5xl lg:text-[3.4rem]"
            >
              Imposition buku, <span className="text-indigo-600">siap cetak</span>.
            </h1>
            <p style={step(2, reduced)} className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-600">
              Susun PDF jadi lembar cetak — booklet, saddle stitch, perfect binding. File tidak pernah keluar dari
              perangkat Anda.
            </p>
            <div style={step(3, reduced)} className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="group inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 hover:shadow-md"
              >
                <UploadCloud className="h-4 w-4 transition group-hover:-translate-y-0.5" /> Upload PDF
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
              {/* The workspace is always one click away, so no duplicate "Mulai
                  Layout" button competes with the primary action. */}
              <button
                onClick={openWorkspace}
                className="group inline-flex items-center gap-1.5 rounded-lg px-1 py-2.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-600 md:hidden"
              >
                Buka Workspace
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {/*
            A sheet drawn in CSS instead of a photograph: no asset to download, it
            stays sharp at any zoom, and each part (crop marks, fold, bleed) can
            animate on its own — which a still image cannot. The floating card on
            top carries the page numbers, so the sheet underneath stays a clean
            imposition plate.
          */}
          <div style={step(4, reduced)} className="relative mx-auto w-full max-w-sm">
            <div className="hero-stage relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-xl">
              <div className="relative p-4">
                <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                  <span>Lembar 1 / 8</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">Booklet</span>
                </div>

                {/* The plate. Crop marks sit outside the trim, the red dashed box is
                    the bleed, and the indigo dashed line is the fold. */}
                <div className="relative rounded-md bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_24px_-12px_rgba(15,23,42,0.18)] ring-1 ring-slate-200">
                  <div className="relative">
                    <span className="absolute -left-2 -top-2 h-2.5 w-2.5 border-l border-t border-slate-400" />
                    <span className="absolute -right-2 -top-2 h-2.5 w-2.5 border-r border-t border-slate-400" />
                    <span className="absolute -bottom-2 -left-2 h-2.5 w-2.5 border-b border-l border-slate-400" />
                    <span className="absolute -right-2 -bottom-2 h-2.5 w-2.5 border-b border-r border-slate-400" />

                    <div className="grid grid-cols-2 gap-2.5">
                      {[0, 1, 2, 3].map((slot) => (
                        <div
                          key={slot}
                          style={
                            reduced
                              ? undefined
                              : { animation: "seebook-settle 820ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${620 + slot * 90}ms` }
                          }
                          className="relative flex aspect-[4/5] flex-col gap-[3px] overflow-hidden rounded-sm border border-slate-200 bg-white p-2"
                        >
                          <div className="h-1 w-3/5 rounded-full bg-slate-300" />
                          <div className="mt-0.5 h-[3px] w-full rounded-full bg-slate-100" />
                          <div className="h-[3px] w-11/12 rounded-full bg-slate-100" />
                          <div className="h-[3px] w-full rounded-full bg-slate-100" />
                          <div className="h-[3px] w-4/5 rounded-full bg-slate-100" />
                          <div className="mt-auto h-[3px] w-2/3 rounded-full bg-slate-100" />
                          <div className="h-[3px] w-1/2 rounded-full bg-slate-100" />
                        </div>
                      ))}
                    </div>

                    {/* Bleed boundary and the fold, drawn over the artwork. */}
                    <div className="pointer-events-none absolute inset-0 border border-dashed border-rose-300/70" />
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-indigo-400/60" />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                  <span>A4 · trim A5</span>
                  <span className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> bleed 3 mm
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> lipat
                    </span>
                  </span>
                </div>
              </div>

              {/* Kept from the earlier design: the one place the imposition rule is
                  spelled out as numbers, so it has something to animate. */}
              <div className="hero-sheet absolute bottom-9 left-3 w-28 rounded-lg border border-white/70 bg-white/95 p-2 shadow-lg backdrop-blur sm:w-32">
                <div className="mb-1.5 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <span>Urutan lipat</span>
                  <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-600">L1</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {["16", "1", "2", "15"].map((n, i) => (
                    <div
                      key={n}
                      style={
                        reduced
                          ? undefined
                          : { animation: "seebook-settle 820ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${980 + i * 90}ms` }
                      }
                      className="flex aspect-[4/5] items-center justify-center rounded-[3px] border border-dashed border-slate-300 bg-white text-[11px] font-black text-slate-300"
                    >
                      {n}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50/60">
        <div ref={features.ref} className="mx-auto max-w-6xl px-6 py-16">
          <h2
            className={`display-title section-title text-2xl font-extrabold sm:text-3xl ${
              features.shown ? "reveal-in" : "reveal-out"
            }`}
          >
            Dari PDF mentah ke lembar cetak
          </h2>
          <p
            className={`mt-2 max-w-lg text-sm text-slate-500 ${features.shown ? "reveal-in" : "reveal-out"}`}
            style={reduced ? undefined : { animationDelay: "80ms" }}
          >
            Semua diproses di perangkat Anda — tidak ada file yang diunggah ke server.
          </p>
          <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <article
                  key={f.title}
                  style={
                    reduced || !features.shown
                      ? undefined
                      : { animation: "seebook-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: `${i * 60}ms` }
                  }
                  className={`rounded-xl border border-slate-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ${
                    features.shown ? "" : "reveal-out"
                  }`}
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
        <div
          ref={closing.ref}
          className={`rounded-xl bg-slate-900 px-6 py-12 text-center ${closing.shown ? "reveal-in" : "reveal-out"}`}
        >
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Siap cetak?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Upload PDF, imposition dihitung otomatis.</p>
          <button
            onClick={() => inputRef.current?.click()}
            className="group mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            <UploadCloud className="h-4 w-4 transition group-hover:-translate-y-0.5" /> Upload PDF
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} seebook — prepress &amp; percetakan.
      </footer>
    </div>
  );
}
