import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearProject } from "../lib/persistence";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, a single throw inside the preview canvas replaced the whole
 * app with a blank page — and because the project only lived in memory, the
 * user's layout work was gone with it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("BookPrint Layout crash", error, info.componentStack);
  }

  private reload = () => this.setState({ error: null });

  private resetAndReload = async () => {
    // A corrupt autosave must not survive into the next boot, or the app
    // crashes again on load and becomes unusable.
    await clearProject();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Terjadi kesalahan</h1>
          <p className="mt-2 text-sm text-slate-500">
            Aplikasi berhenti menangani tampilan ini. Layout Anda tersimpan otomatis di browser,
            jadi memuat ulang biasanya cukup.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-100 p-3 text-[11px] text-slate-600">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={this.reload}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Coba lanjutkan
            </button>
            <button
              onClick={() => void this.resetAndReload()}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Mulai ulang &amp; hapus proyek tersimpan
            </button>
          </div>
        </div>
      </div>
    );
  }
}
