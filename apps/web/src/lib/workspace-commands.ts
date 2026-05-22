import { CLAROS_THEMES, type ClarosThemeId } from "@claros/editor-core";

import type { WorkspaceChapter, WorkspaceScene } from "./project-session";
import type { PaletteCommand, StorageBackendId } from "./workspace-types";
import type { ManuscriptInsertionPlacement } from "@claros/story-state/browser";

export interface WorkspacePaletteCommandOptions {
  currentTheme: ClarosThemeId;
  currentVimMode: boolean;
  currentProjectIsOpen: boolean;
  localProjectSupported: boolean;
  sidebarOpen: boolean;
  currentScene: WorkspaceScene | undefined;
  currentChapter: WorkspaceChapter | undefined;
  canMoveSceneUp: boolean;
  canMoveSceneDown: boolean;
  canMoveChapterUp: boolean;
  canMoveChapterDown: boolean;
  canDeleteScene: boolean;
  canDeleteChapter: boolean;
  toggleSidebar(): void;
  openProjectWithBackend(backendId: StorageBackendId): void;
  createProjectWithBackend(backendId: StorageBackendId): void;
  flushSaveWithoutWaiting(): void;
  openProjectTitleModal(): void;
  openAppendChapterModal(): void;
  openInsertChapterModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    chapter?: WorkspaceChapter
  ): void;
  openCurrentChapterTitleModal(): void;
  moveCurrentChapter(direction: "up" | "down"): void;
  openCurrentChapterDeleteModal(): void;
  openAppendSceneModal(): void;
  openInsertSceneModal(
    placement: Exclude<ManuscriptInsertionPlacement, "append">,
    scene?: WorkspaceScene
  ): void;
  openCurrentSceneTitleModal(): void;
  moveCurrentScene(direction: "up" | "down"): void;
  openCurrentSceneDeleteModal(): void;
  toggleVimMode(): void;
  setTheme(themeId: ClarosThemeId): void;
}

export function buildWorkspacePaletteCommands(
  options: WorkspacePaletteCommandOptions
): PaletteCommand[] {
  const projectCommandDisabled = !options.currentProjectIsOpen;
  return [
    {
      label: "Toggle Sidebar",
      active: options.sidebarOpen,
      disabled: projectCommandDisabled,
      focusAfter: "none",
      run: options.toggleSidebar,
    },
    {
      label: "Open Project: Local Folder",
      disabled: !options.localProjectSupported,
      focusAfter: "editor",
      run: () => options.openProjectWithBackend("file-picker"),
    },
    {
      label: "New Project: Local Folder",
      disabled: !options.localProjectSupported,
      focusAfter: "editor",
      run: () => options.createProjectWithBackend("file-picker"),
    },
    {
      label: "Open Project: Local Companion",
      focusAfter: "editor",
      run: () => options.openProjectWithBackend("local-companion"),
    },
    {
      label: "New Project: Local Companion",
      focusAfter: "editor",
      run: () => options.createProjectWithBackend("local-companion"),
    },
    {
      label: "Save Document",
      disabled: projectCommandDisabled,
      focusAfter: "editor",
      run: options.flushSaveWithoutWaiting,
    },
    {
      label: "Change Title: Project",
      disabled: projectCommandDisabled,
      focusAfter: "none",
      run: options.openProjectTitleModal,
    },
    {
      label: "Append: New Chapter",
      disabled: projectCommandDisabled,
      focusAfter: "none",
      run: options.openAppendChapterModal,
    },
    {
      label: "Add Before: New Chapter",
      disabled: projectCommandDisabled || options.currentChapter === undefined,
      focusAfter: "none",
      run: () => options.openInsertChapterModal("before", options.currentChapter),
    },
    {
      label: "Add After: New Chapter",
      disabled: projectCommandDisabled || options.currentChapter === undefined,
      focusAfter: "none",
      run: () => options.openInsertChapterModal("after", options.currentChapter),
    },
    {
      label: "Change Title: Current Chapter",
      disabled: projectCommandDisabled || options.currentChapter === undefined,
      focusAfter: "none",
      run: options.openCurrentChapterTitleModal,
    },
    {
      label: "Move Up: Current Chapter",
      disabled: !options.canMoveChapterUp,
      focusAfter: "sidebar",
      run: () => options.moveCurrentChapter("up"),
    },
    {
      label: "Move Down: Current Chapter",
      disabled: !options.canMoveChapterDown,
      focusAfter: "sidebar",
      run: () => options.moveCurrentChapter("down"),
    },
    {
      label: "Delete: Current Chapter",
      disabled: !options.canDeleteChapter,
      focusAfter: "none",
      run: options.openCurrentChapterDeleteModal,
    },
    {
      label: "Append: New Scene",
      disabled: projectCommandDisabled,
      focusAfter: "none",
      run: options.openAppendSceneModal,
    },
    {
      label: "Add Before: New Scene",
      disabled: projectCommandDisabled || options.currentScene === undefined,
      focusAfter: "none",
      run: () => options.openInsertSceneModal("before", options.currentScene),
    },
    {
      label: "Add After: New Scene",
      disabled: projectCommandDisabled || options.currentScene === undefined,
      focusAfter: "none",
      run: () => options.openInsertSceneModal("after", options.currentScene),
    },
    {
      label: "Change Title: Current Scene",
      disabled: projectCommandDisabled || options.currentScene === undefined,
      focusAfter: "none",
      run: options.openCurrentSceneTitleModal,
    },
    {
      label: "Move Up: Current Scene",
      disabled: !options.canMoveSceneUp,
      focusAfter: "sidebar",
      run: () => options.moveCurrentScene("up"),
    },
    {
      label: "Move Down: Current Scene",
      disabled: !options.canMoveSceneDown,
      focusAfter: "sidebar",
      run: () => options.moveCurrentScene("down"),
    },
    {
      label: "Delete: Current Scene",
      disabled: !options.canDeleteScene,
      focusAfter: "none",
      run: options.openCurrentSceneDeleteModal,
    },
    {
      label: options.currentVimMode ? "Disable Vim" : "Enable Vim",
      active: options.currentVimMode,
      disabled: projectCommandDisabled,
      focusAfter: "editor",
      run: options.toggleVimMode,
    },
    ...CLAROS_THEMES.map((theme) => ({
      label: `Theme: ${theme.label}`,
      active: theme.id === options.currentTheme,
      focusAfter: "editor" as const,
      run: () => options.setTheme(theme.id),
    })),
    {
      label: "Focus Editor",
      disabled: projectCommandDisabled,
      focusAfter: "editor",
      run: () => undefined,
    },
  ];
}
