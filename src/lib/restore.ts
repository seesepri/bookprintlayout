import { loadProject, markResumeSettled, mergeRestoredState } from "./persistence";
import { rebuildThumbnails } from "./uploadHandler";
import type { ProjectState } from "../state/ProjectContext";

/**
 * Resumes the autosaved project: reads the record, rebuilds the derived
 * thumbnails from the stored PDF bytes, and merges everything back over the
 * defaults. Returns null when there is nothing worth resuming.
 */
export async function restoreProject(): Promise<ProjectState | null> {
  try {
    return await resume();
  } finally {
    markResumeSettled();
  }
}

async function resume(): Promise<ProjectState | null> {
  const saved = await loadProject();
  if (!saved) return null;

  // Thumbnail failures are contained in rebuildThumbnails: a source file that
  // no longer decodes must not block the layout itself from coming back.
  const pages = await rebuildThumbnails(saved.state.sourceBytes, saved.state.pages);
  return mergeRestoredState({ ...saved.state, pages });
}
