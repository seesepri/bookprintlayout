import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
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

interface ProjectState {
  route: "landing" | "workspace";
  activeView: ViewKey;
  sourceBytes: Uint8Array | null;
  meta: ProjectFileMeta;
  pages: PageInfo[];

  bookSizePreset: PresetBookSize;
  bookSizeCustom: SizeMM;
  paperSizePreset: PresetPaperSize;
  paperSizeCustom: SizeMM;
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

type Action =
  | { type: "GO_WORKSPACE" }
  | { type: "GO_LANDING" }
  | { type: "SET_VIEW"; view: ViewKey }
  | { type: "SET_SOURCE"; bytes: Uint8Array; meta: ProjectFileMeta; pages: PageInfo[] }
  | { type: "SET_PAGES"; pages: PageInfo[] }
  | { type: "SET_BOOK_SIZE_PRESET"; preset: PresetBookSize }
  | { type: "SET_BOOK_SIZE_CUSTOM"; size: SizeMM }
  | { type: "SET_PAPER_SIZE_PRESET"; preset: PresetPaperSize }
  | { type: "SET_PAPER_SIZE_CUSTOM"; size: SizeMM }
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
  | { type: "UNDO" }
  | { type: "__RESTORE__"; state: ProjectState };

const initialState: ProjectState = {
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
  },

  creep: { paperThicknessMm: 0.1, mode: "auto", manualAmountMm: 0.3 },
  cover: { spineWidthMm: 10, bleedMm: 3, includeCropMarks: true },
  exportSettings: {
    format: "print-ready",
    quality: "print",
    includeCropMarks: true,
    includeBleed: true,
    includeRegistration: true,
    compress: false,
    embedFonts: true,
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
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const historyRef = useRef<ProjectState[]>([]);
  stateRef.current = state;
  const dispatch = useCallback((action: Action) => {
    if (action.type === "UNDO") {
      const previous = historyRef.current.pop();
      if (previous) baseDispatch({ type: "__RESTORE__", state: previous });
      return;
    }
    const transient = action.type === "SET_ZOOM" || action.type === "SET_GENERATING" || action.type === "SET_GENERATED" || action.type === "SET_GENERATED_COVER";
    if (!transient) {
      historyRef.current.push(stateRef.current);
      if (historyRef.current.length > 50) historyRef.current.shift();
    }
    baseDispatch(action);
  }, [baseDispatch]);

  const activeBookSize = useMemo(
    () => (state.bookSizePreset === "Custom" ? state.bookSizeCustom : BOOK_SIZE_PRESETS[state.bookSizePreset]),
    [state.bookSizePreset, state.bookSizeCustom]
  );
  const activePaperSize = useMemo(
    () => (state.paperSizePreset === "Custom" ? state.paperSizeCustom : PAPER_SIZE_PRESETS[state.paperSizePreset]),
    [state.paperSizePreset, state.paperSizeCustom]
  );

  const value = useMemo(
    () => ({ state, dispatch, activeBookSize, activePaperSize }),
    [state, activeBookSize, activePaperSize]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

export function useProjectActions() {
  const { dispatch } = useProject();
  return useMemo(
    () => ({
      goWorkspace: () => dispatch({ type: "GO_WORKSPACE" }),
      goLanding: () => dispatch({ type: "GO_LANDING" }),
      setView: (view: ViewKey) => dispatch({ type: "SET_VIEW", view }),
    }),
    [dispatch]
  );
}

export const useProjectDispatch = () => useProject().dispatch;
export const useProjectSelector = <T,>(selector: (s: ProjectState) => T) => {
  const { state } = useProject();
  return useCallback(selector, [selector])(state);
};
