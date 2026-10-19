import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { normalizePagesPerSide, type PagesPerSideSetting } from "../lib/nup";
import { saveProject } from "../lib/persistence";
import {
  BindingDirection,
  BindingType,
  CoverSettings,
  CreepSettings,
  ExportSettings,
  MarksSettings,
  Orientation,
  PageInfo,
  PresetBookSize,
  PresetPaperSize,
  ProjectFileMeta,
  SizeMM,
  ViewKey,
  ViewMode,
} from "../types";
import { BOOK_SIZE_PRESETS, PAPER_SIZE_PRESETS } from "../lib/paperSizes";

export interface ProjectState {
  route: "landing" | "workspace";
  activeView: ViewKey;
  sourceBytes: Uint8Array | null;
  meta: ProjectFileMeta;
  pages: PageInfo[];

  bookSizePreset: PresetBookSize;
  bookSizeCustom: SizeMM;
  paperSizePreset: PresetPaperSize;
  paperSizeCustom: SizeMM;
  /** Pages-per-side density for the print sheet. "auto" keeps the classic spread on folded bindings. */
  pagesPerSide: PagesPerSideSetting;
  /** 4-up folded sheets: top band upside down (head-to-head) or upright for a manual cut-and-turn. */
  quadHeadToHead: boolean;
  orientation: Orientation;

  binding: BindingType;
  bindingDirection: BindingDirection;
  signatureSize: number;

  bleedMm: number;
  safeAreaMm: number;
  gutterMm: number;
  marks: MarksSettings;

  creep: CreepSettings;
  cover: CoverSettings;
  exportSettings: ExportSettings;

  viewMode: ViewMode;
  zoom: number;

  generatedPdf: Uint8Array | null;
  generatedCover: Uint8Array | null;
  isGenerating: boolean;
}

export type Action =
  | { type: "GO_WORKSPACE" }
  | { type: "GO_LANDING" }
  | { type: "SET_VIEW"; view: ViewKey }
  | { type: "SET_SOURCE"; bytes: Uint8Array; meta: ProjectFileMeta; pages: PageInfo[] }
  | { type: "SET_PAGES"; pages: PageInfo[] }
  | { type: "SET_BOOK_SIZE_PRESET"; preset: PresetBookSize }
  | { type: "SET_BOOK_SIZE_CUSTOM"; size: SizeMM }
  | { type: "SET_PAPER_SIZE_PRESET"; preset: PresetPaperSize }
  | { type: "SET_PAPER_SIZE_CUSTOM"; size: SizeMM }
  | { type: "SET_PAGES_PER_SIDE"; value: PagesPerSideSetting }
  | { type: "SET_QUAD_HEAD_TO_HEAD"; value: boolean }
  | { type: "SET_ORIENTATION"; orientation: Orientation }
  | { type: "SET_BINDING"; binding: BindingType }
  | { type: "SET_BINDING_DIRECTION"; direction: BindingDirection }
  | { type: "SET_SIGNATURE_SIZE"; size: number }
  | { type: "SET_BLEED"; value: number }
  | { type: "SET_SAFE_AREA"; value: number }
  | { type: "SET_GUTTER"; value: number }
  | { type: "SET_MARKS"; marks: Partial<MarksSettings> }
  | { type: "SET_CREEP"; creep: Partial<CreepSettings> }
  | { type: "SET_COVER"; cover: Partial<CoverSettings> }
  | { type: "SET_EXPORT"; settings: Partial<ExportSettings> }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "SET_GENERATED"; bytes: Uint8Array | null }
  | { type: "SET_GENERATED_COVER"; bytes: Uint8Array | null }
  | { type: "SET_GENERATING"; value: boolean }
  | { type: "RESET_PROJECT" }
  | { type: "HYDRATE"; state: ProjectState }
  | { type: "UNDO" }
  | { type: "__RESTORE__"; state: ProjectState };

export const initialState: ProjectState = {
  route: "landing",
  activeView: "pages",
  sourceBytes: null,
  meta: {
    fileName: "",
    fileSizeBytes: 0,
    pageCount: 0,
    pageSizePt: { width: 0, height: 0 },
    status: "empty",
  },
  pages: [],

  bookSizePreset: "A5",
  bookSizeCustom: { ...BOOK_SIZE_PRESETS.A5 },
  paperSizePreset: "A4",
  paperSizeCustom: { ...PAPER_SIZE_PRESETS.A4 },
  pagesPerSide: "auto",
  quadHeadToHead: true,
  orientation: "auto",

  binding: "booklet",
  bindingDirection: "left",
  signatureSize: 16,

  bleedMm: 3,
  safeAreaMm: 5,
  gutterMm: 4,
  marks: {
    showCropMarks: true,
    showBleedArea: true,
    showSafeArea: false,
    showFoldMarks: true,
    showCenterLine: false,
    showRegistrationMarks: false,
  },

  creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0.3 },
  cover: { spineWidthMm: 10, bleedMm: 3, includeCropMarks: true },
  exportSettings: {
    format: "print-ready",
    includeCropMarks: true,
    includeBleed: true,
    includeRegistration: true,
    compress: true,
  },

  viewMode: "spread",
  zoom: 1,

  generatedPdf: null,
  generatedCover: null,
  isGenerating: false,
};

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case "GO_WORKSPACE":
      return { ...state, route: "workspace" };
    case "GO_LANDING":
      return { ...state, route: "landing" };
    case "SET_VIEW":
      return { ...state, activeView: action.view };
    case "SET_SOURCE":
      return { ...state, sourceBytes: action.bytes, meta: action.meta, pages: action.pages, generatedPdf: null };
    case "SET_PAGES":
      return { ...state, pages: action.pages, generatedPdf: null };
    case "SET_BOOK_SIZE_PRESET":
      return {
        ...state,
        bookSizePreset: action.preset,
        generatedPdf: null,
        bookSizeCustom:
          action.preset === "Custom" ? state.bookSizeCustom : { ...BOOK_SIZE_PRESETS[action.preset] },
      };
    case "SET_BOOK_SIZE_CUSTOM":
      return { ...state, bookSizeCustom: action.size, generatedPdf: null };
    case "SET_PAPER_SIZE_PRESET":
      return {
        ...state,
        paperSizePreset: action.preset,
        generatedPdf: null,
        paperSizeCustom:
          action.preset === "Custom" ? state.paperSizeCustom : { ...PAPER_SIZE_PRESETS[action.preset] },
      };
    case "SET_PAPER_SIZE_CUSTOM":
      return { ...state, paperSizeCustom: action.size, generatedPdf: null };
    case "SET_PAGES_PER_SIDE":
      return { ...state, pagesPerSide: normalizePagesPerSide(action.value), generatedPdf: null };
    case "SET_QUAD_HEAD_TO_HEAD":
      return { ...state, quadHeadToHead: action.value, generatedPdf: null };
    case "SET_ORIENTATION":
      return { ...state, orientation: action.orientation, generatedPdf: null };
    case "SET_BINDING":
      return { ...state, binding: action.binding, generatedPdf: null };
    case "SET_BINDING_DIRECTION":
      return { ...state, bindingDirection: action.direction, generatedPdf: null };
    case "SET_SIGNATURE_SIZE":
      return { ...state, signatureSize: action.size, generatedPdf: null };
    case "SET_BLEED":
      return { ...state, bleedMm: action.value, generatedPdf: null };
    case "SET_SAFE_AREA":
      return { ...state, safeAreaMm: action.value, generatedPdf: null };
    case "SET_GUTTER":
      return { ...state, gutterMm: action.value, generatedPdf: null };
    case "SET_MARKS":
      return { ...state, marks: { ...state.marks, ...action.marks }, generatedPdf: null };
    case "SET_CREEP":
      return { ...state, creep: { ...state.creep, ...action.creep }, generatedPdf: null };
    case "SET_COVER":
      return { ...state, cover: { ...state.cover, ...action.cover } };
    case "SET_EXPORT":
      return { ...state, exportSettings: { ...state.exportSettings, ...action.settings }, generatedPdf: null };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.mode };
    case "SET_ZOOM":
      return { ...state, zoom: action.zoom };
    case "SET_GENERATED":
      return { ...state, generatedPdf: action.bytes };
    case "SET_GENERATED_COVER":
      return { ...state, generatedCover: action.bytes };
    case "SET_GENERATING":
      return { ...state, isGenerating: action.value };
    case "RESET_PROJECT":
      return { ...initialState };
    case "HYDRATE":
      return action.state;
    case "UNDO":
      return state;
    case "__RESTORE__":
      return action.state;
    default:
      return state;
  }
}

interface ProjectContextValue {
  state: ProjectState;
  dispatch: React.Dispatch<Action>;
  activeBookSize: SizeMM;
  activePaperSize: SizeMM;
  /** Replace the whole project (used by autosave restore). */
  hydrate: (next: ProjectState) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);
const ProjectDispatchContext = createContext<React.Dispatch<Action> | null>(null);

/** Never pushed to history: presentation-only or machine-output changes. */
const NON_UNDOABLE = new Set<Action["type"]>([
  "SET_ZOOM",
  "SET_GENERATING",
  "SET_GENERATED",
  "SET_GENERATED_COVER",
  "HYDRATE",
]);

/**
 * Typing a number field fires one action per keystroke (file picks are not
 * coalesced: they are discrete choices a user expects to undo on their own). Consecutive actions of
 * the *same* kind inside COALESCE_MS collapse into a single history entry, so
 * 50 undo slots means ~50 edits a human would call "a change", not 50 digits.
 */
const COALESCE_MS = 800;
const COALESCABLE = new Set<Action["type"]>([
  "SET_BLEED",
  "SET_SAFE_AREA",
  "SET_GUTTER",
  "SET_CREEP",
  "SET_SIGNATURE_SIZE",
  "SET_BOOK_SIZE_CUSTOM",
  "SET_PAPER_SIZE_CUSTOM",
  "SET_PAGES_PER_SIDE",
]);

const AUTOSAVE_MS = 800;

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const historyRef = useRef<ProjectState[]>([]);
  const lastPush = useRef<{ type: Action["type"]; at: number } | null>(null);
  stateRef.current = state;
  const dispatch = useCallback((action: Action) => {
    if (action.type === "UNDO") {
      const previous = historyRef.current.pop();
      lastPush.current = null;
      if (previous) baseDispatch({ type: "__RESTORE__", state: previous });
      return;
    }
    if (!NON_UNDOABLE.has(action.type)) {
      const now = Date.now();
      const merge =
        COALESCABLE.has(action.type) &&
        lastPush.current?.type === action.type &&
        now - lastPush.current.at < COALESCE_MS;
      if (!merge) {
        historyRef.current.push(stateRef.current);
        if (historyRef.current.length > 50) historyRef.current.shift();
      }
      lastPush.current = { type: action.type, at: now };
    }
    baseDispatch(action);
  }, [baseDispatch]);

  // Debounced autosave. Skipped right after a hydrate so restoring never
  // writes the same record back for no reason.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) {
      hydratedRef.current = false;
      return;
    }
    const id = setTimeout(() => {
      void saveProject(state).catch(() => {
        /* quota or blocked storage: layout work continues in memory */
      });
    }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [state]);

  const hydrate = useCallback((next: ProjectState) => {
    hydratedRef.current = true;
    baseDispatch({ type: "HYDRATE", state: next });
  }, []);

  const activeBookSize = useMemo(
    () => (state.bookSizePreset === "Custom" ? state.bookSizeCustom : BOOK_SIZE_PRESETS[state.bookSizePreset]),
    [state.bookSizePreset, state.bookSizeCustom]
  );
  const activePaperSize = useMemo(
    () => (state.paperSizePreset === "Custom" ? state.paperSizeCustom : PAPER_SIZE_PRESETS[state.paperSizePreset]),
    [state.paperSizePreset, state.paperSizeCustom]
  );

  const value = useMemo(
    () => ({ state, dispatch, activeBookSize, activePaperSize, hydrate }),
    [state, activeBookSize, activePaperSize, hydrate]
  );

  return (
    <ProjectDispatchContext.Provider value={dispatch}>
      <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
    </ProjectDispatchContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

/**
 * Dispatch without the state subscription: components that only fire actions
 * never re-render when the project changes.
 */
export function useProjectDispatch(): React.Dispatch<Action> {
  const dispatch = useContext(ProjectDispatchContext);
  if (!dispatch) throw new Error("useProjectDispatch must be used within ProjectProvider");
  return dispatch;
}

/**
 * Named navigation actions. Subscribes to the dispatch context only, so these
 * callers never re-render when project state changes.
 */
export function useProjectActions() {
  const dispatch = useProjectDispatch();
  return useMemo(
    () => ({
      goWorkspace: () => dispatch({ type: "GO_WORKSPACE" }),
      goLanding: () => dispatch({ type: "GO_LANDING" }),
      setView: (view: ViewKey) => dispatch({ type: "SET_VIEW", view }),
      resetProject: () => dispatch({ type: "RESET_PROJECT" }),
    }),
    [dispatch]
  );
}
