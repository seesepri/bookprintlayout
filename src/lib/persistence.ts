import type { PageInfo, ProjectFileMeta } from "../types";
import { normalizePagesPerSide } from "./nup";
import { initialState, type ProjectState } from "../state/ProjectContext";

/**
 * Autosave for the whole project, so a refresh or a tab crash no longer
 * destroys an afternoon of layout work.
 *
 * Storage is IndexedDB rather than localStorage: `sourceBytes` is a binary
 * blob of arbitrary size and localStorage would hit its ~5 MB quota (and
 * synchronously block the main thread) on the first real book.
 *
 * Thumbnails are deliberately NOT persisted. They are derived from
 * `sourceBytes`, and re-deriving them on restore keeps the record small
 * (a 400-thumbnail book is several MB of base64 for zero benefit).
 */
const DB_NAME = "bookprint-layout";
const STORE = "projects";
/** Small record: settings + page order. */
const KEY = "current";
/** Big record: the uploaded PDF itself, written only when it actually changes. */
const KEY_BYTES = "source";
/** Bump when the saved shape changes incompatibly; older saves are discarded. */
export const PROJECT_SCHEMA_VERSION = 1;

/**
 * Storage that cannot be opened at all: no IndexedDB (private mode, a locked-down
 * embed), or another tab holding the upgrade open. Kept apart from a full disk
 * because the two need different advice, and the user is the one who has to act.
 */
export class StorageBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageBlockedError";
  }
}

export type AutosaveFailure = "quota" | "blocked" | "unknown";

/**
 * Autosave never throws — a failure mid-edit must not become a crash — so it
 * reports through this instead. `reason` exists so the message can tell "your
 * storage is full" apart from "this browser will not store anything", which are
 * different problems for the user to solve.
 */
export type AutosaveResult = { ok: true } | { ok: false; reason: AutosaveFailure };

interface SourceRecord {
  fileName: string;
  bytes: Uint8Array;
}

/** What actually sits in the object store — the PDF lives under its own key. */
interface StoredProject {
  version: number;
  savedAt: number;
  state: Omit<SavedState, "sourceBytes">;
}

/** A stored record with the source bytes rejoined: what callers resume from. */
export interface SavedProject extends StoredProject {
  state: SavedState;
}

type SavedState = {
  meta: ProjectFileMeta;
  sourceBytes: Uint8Array;
  pages: Omit<PageInfo, "thumbnail">[];
} & Pick<
  ProjectState,
  | "bookSizePreset"
  | "bookSizeCustom"
  | "paperSizePreset"
  | "paperSizeCustom"
  | "pagesPerSide"
  | "quadHeadToHead"
  | "orientation"
  | "binding"
  | "bindingDirection"
  | "signatureSize"
  | "bleedMm"
  | "safeAreaMm"
  | "gutterMm"
  | "marks"
  | "creep"
  | "cover"
  | "exportSettings"
  | "viewMode"
  | "zoom"
>;

/** Browsers without IndexedDB (private mode, non-DOM hosts) must not crash the app. */
function storageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!storageAvailable()) {
      reject(new StorageBlockedError("IndexedDB tidak tersedia"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new StorageBlockedError("IndexedDB diblokir tab lain"));
  });
}

export function toSavedState(state: ProjectState): SavedState {
  return {
    meta: state.meta,
    sourceBytes: state.sourceBytes ?? new Uint8Array(0),
    pages: state.pages.map(({ thumbnail: _thumbnail, ...rest }) => rest),
    bookSizePreset: state.bookSizePreset,
    bookSizeCustom: state.bookSizeCustom,
    paperSizePreset: state.paperSizePreset,
    paperSizeCustom: state.paperSizeCustom,
    pagesPerSide: state.pagesPerSide,
    quadHeadToHead: state.quadHeadToHead,
    orientation: state.orientation,
    binding: state.binding,
    bindingDirection: state.bindingDirection,
    signatureSize: state.signatureSize,
    bleedMm: state.bleedMm,
    safeAreaMm: state.safeAreaMm,
    gutterMm: state.gutterMm,
    marks: state.marks,
    creep: state.creep,
    cover: {
      // File objects cannot be structured-cloned; their bytes live in
      // `sourceBytes` only for the interior PDF. Cover art is intentionally
      // not persisted and the UI says so.
      spineWidthMm: state.cover.spineWidthMm,
      bleedMm: state.cover.bleedMm,
      includeCropMarks: state.cover.includeCropMarks,
    },
    exportSettings: state.exportSettings,
    viewMode: state.viewMode,
    zoom: state.zoom,
  };
}

/** True when there is anything worth writing back. */
export function hasProject(state: ProjectState): boolean {
  return state.pages.length > 0 || !!state.sourceBytes?.length;
}

/**
 * Reference of the PDF bytes last written to disk. The state record is small,
 * but `sourceBytes` can be 100 MB+, and re-cloning it after every pause in
 * typing is main-thread work the user would feel. The upload reducer always
 * stores a fresh array, so a reference change means a genuinely new file.
 */
let lastBytesWritten: Uint8Array | null = null;

/**
 * Autosave is frozen until the boot-time resume attempt has finished. Without
 * this, the first debounced write (which fires on the empty initial state) can
 * clear the stored project before `loadProject` has read it back.
 */
let resumeSettled = false;
export function markResumeSettled(): void {
  resumeSettled = true;
}

/** Maps whatever the browser threw onto something the message can act on. */
function classifyFailure(error: unknown): AutosaveFailure {
  if (error instanceof StorageBlockedError) return "blocked";
  const name = error instanceof Error ? error.name : "";
  const code = (error as { code?: number } | null)?.code;
  // Chrome and Firefox disagree on the name of a full store; both agree on 22 / 1014.
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014) {
    return "quota";
  }
  return "unknown";
}

export async function saveProject(state: ProjectState): Promise<AutosaveResult> {
  if (!resumeSettled) return { ok: true };
  if (!hasProject(state)) {
    await clearProject();
    return { ok: true };
  }
  const { sourceBytes, ...storedState } = toSavedState(state);
  const record: StoredProject = { version: PROJECT_SCHEMA_VERSION, savedAt: Date.now(), state: storedState };
  const bytesChanged = sourceBytes !== lastBytesWritten;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(record, KEY);
      if (bytesChanged) store.put({ fileName: state.meta.fileName, bytes: sourceBytes }, KEY_BYTES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    if (bytesChanged) lastBytesWritten = sourceBytes;
    return { ok: true };
  } catch (error) {
    // Autosave is best-effort: a full or blocked store must never surface as a
    // crash in the middle of the user's work. The caller gets the reason so it
    // can warn — swallowing the error here used to mean work vanished on reload
    // with nothing on screen suggesting anything had gone wrong.
    console.warn("Autosave dilewati:", error);
    return { ok: false, reason: classifyFailure(error) };
  }
}

export async function loadProject(): Promise<SavedProject | null> {
  try {
    const db = await openDb();
    const [record, source] = await new Promise<[StoredProject | undefined, SourceRecord | undefined]>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const stateReq = tx.objectStore(STORE).get(KEY);
        const bytesReq = tx.objectStore(STORE).get(KEY_BYTES);
        tx.oncomplete = () =>
          resolve([stateReq.result as StoredProject | undefined, bytesReq.result as SourceRecord | undefined]);
        tx.onerror = () => reject(tx.error);
      }
    );
    db.close();
    if (!record || record.version !== PROJECT_SCHEMA_VERSION) return null;
    if (!record.state?.pages?.length) return null;
    // Without the source PDF the thumbnails cannot be rebuilt and "regenerate
    // from original" would be a lie, so an orphaned record is not resumable.
    if (!source?.bytes?.length) return null;
    lastBytesWritten = source.bytes;
    return { ...record, state: { ...record.state, sourceBytes: source.bytes } };
  } catch {
    // Private mode, disabled storage, or a corrupt record: never block boot.
    return null;
  }
}

/**
 * Overlay a persisted record on the defaults. Called after thumbnails are
 * rebuilt. Deliberately resets the transient fields: `route`/`activeView` so a
 * resume lands where the work is, and `cover` file/blob slots so a stale handle
 * from a previous session can never be rendered.
 */
export function mergeRestoredState(saved: SavedState): ProjectState {
  const { meta, sourceBytes, pages, cover, ...settings } = saved;
  return {
    ...initialState,
    ...settings,
    // Saves written before the coercion existed can hold "4"/"2" strings, which
    // would silently fall back to the spread.
    pagesPerSide: normalizePagesPerSide(settings.pagesPerSide),
    quadHeadToHead: settings.quadHeadToHead !== false,
    meta,
    sourceBytes,
    pages,
    cover: { ...initialState.cover, ...cover, frontFile: null, backFile: null, spineFile: null },
    isGenerating: false,
    generatedPdf: null,
    generatedCover: null,
    route: "workspace",
    activeView: "pages",
  };
}

export async function clearProject(): Promise<void> {
  lastBytesWritten = null;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.objectStore(STORE).delete(KEY_BYTES);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* nothing to clean up */
  }
}
