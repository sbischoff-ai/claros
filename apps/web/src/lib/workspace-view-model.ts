import type {
  ProjectSession,
  WorkspaceChapter,
  WorkspaceNote,
  WorkspaceNoteFolder,
  WorkspaceScene,
} from "./project-session";
import type { PaletteCommand, SaveState } from "./workspace-types";

export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  return commands.filter((command) => command.label.toLowerCase().includes(normalizedQuery));
}

export function clampCommandIndex(index: number, commandCount: number): number {
  if (commandCount === 0) {
    return 0;
  }

  return Math.min(index, commandCount - 1);
}

export function listProjectChapters(
  revision: number,
  session: ProjectSession | undefined
): WorkspaceChapter[] {
  return revision < 0 ? [] : (session?.listChapters() ?? []);
}

export function listProjectScenes(
  revision: number,
  session: ProjectSession | undefined
): WorkspaceScene[] {
  return revision < 0 ? [] : (session?.listScenes() ?? []);
}

export function listProjectNotes(
  revision: number,
  session: ProjectSession | undefined
): WorkspaceNote[] {
  return revision < 0 ? [] : (session?.listNotes() ?? []);
}

export function listProjectNoteFolders(
  revision: number,
  session: ProjectSession | undefined
): WorkspaceNoteFolder[] {
  return revision < 0 ? [] : (session?.listNoteFolders() ?? []);
}

export function projectTitleForDisplay(
  revision: number,
  session: ProjectSession | undefined,
  optimisticTitle: string | undefined
): string {
  if (optimisticTitle !== undefined) {
    return optimisticTitle;
  }
  return revision < 0 ? "Claros" : (session?.manifest.title ?? "Claros");
}

export function saveStateLabel(state: SaveState): string {
  if (state === "dirty") {
    return "Unsaved";
  }
  if (state === "saving") {
    return "Saving";
  }
  if (state === "error") {
    return "Save failed";
  }
  return "Saved";
}
