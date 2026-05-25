import { tick } from "svelte";
import type { ClarosThemeId } from "@claros/editor-core";

import { saveTheme } from "$lib/theme";
import { buildWorkspacePaletteCommands } from "$lib/workspace-commands";
import type { PaletteCommand } from "$lib/workspace-types";
import { clampCommandIndex, filterCommands } from "$lib/workspace-view-model";
import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceFocus } from "./workspace-focus.svelte";
import type { WorkspaceManuscriptActions } from "./workspace-manuscript-actions.svelte";
import type { WorkspaceProjects } from "./workspace-projects.svelte";
import type { WorkspaceSidebarController } from "./workspace-sidebar.svelte";
import type { WorkspaceTitles } from "./workspace-titles.svelte";

export class WorkspacePalette {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments,
    private readonly focus: WorkspaceFocus,
    private readonly manuscript: WorkspaceManuscriptActions,
    private readonly projects: WorkspaceProjects,
    private readonly sidebar: WorkspaceSidebarController,
    private readonly titles: WorkspaceTitles
  ) {}

  get paletteCommands(): PaletteCommand[] {
    return buildWorkspacePaletteCommands({
      currentTheme: this.ctx.activeTheme,
      currentVimMode: this.ctx.vimMode,
      currentProjectIsOpen: this.ctx.projectIsOpen,
      localProjectSupported: this.ctx.canOpenLocalProject,
      sidebarOpen: this.ctx.sidebarOpen,
      currentScene: this.ctx.activeScene,
      currentChapter: this.ctx.activeChapter,
      currentNote: this.ctx.activeNote,
      canMoveSceneUp: this.ctx.canMoveCurrentSceneUp,
      canMoveSceneDown: this.ctx.canMoveCurrentSceneDown,
      canMoveChapterUp: this.ctx.canMoveCurrentChapterUp,
      canMoveChapterDown: this.ctx.canMoveCurrentChapterDown,
      canDeleteScene: this.ctx.canDeleteCurrentScene,
      canDeleteChapter: this.ctx.canDeleteCurrentChapter,
      canDeleteNote: this.ctx.canDeleteCurrentNote,
      canDeleteNoteFolder: this.ctx.canDeleteCurrentNoteFolder,
      toggleSidebar: () => this.focus.toggleSidebar(),
      openProjectWithBackend: (backendId) => void this.projects.openProjectWithBackend(backendId),
      createProjectWithBackend: (backendId) =>
        void this.projects.createProjectWithBackend(backendId),
      flushSaveWithoutWaiting: () => this.documents.flushSaveWithoutWaiting(),
      openProjectTitleModal: () => this.titles.openProjectTitleModal(),
      openAppendChapterModal: () => this.titles.openAppendChapterModal(),
      openInsertChapterModal: (placement, chapter) =>
        this.titles.openInsertChapterModal(placement, chapter),
      openCurrentChapterTitleModal: () => this.titles.openCurrentChapterTitleModal(),
      moveCurrentChapter: (direction) => void this.manuscript.moveCurrentChapter(direction),
      openCurrentChapterDeleteModal: () => this.sidebar.openCurrentChapterDeleteModal(),
      openAppendSceneModal: () => this.titles.openAppendSceneModal(),
      openInsertSceneModal: (placement, scene) =>
        this.titles.openInsertSceneModal(placement, scene),
      openCurrentSceneTitleModal: () => this.titles.openCurrentSceneTitleModal(),
      moveCurrentScene: (direction) => void this.manuscript.moveCurrentScene(direction),
      openCurrentSceneDeleteModal: () => this.sidebar.openCurrentSceneDeleteModal(),
      openNewNoteModal: () => this.titles.openNewNoteModal(),
      openNewNoteFolderModal: () => this.titles.openNewNoteFolderModal(),
      openCurrentNoteMoveModal: () => this.titles.openMoveNoteModal(),
      openCurrentNoteDeleteModal: () => this.sidebar.openCurrentNoteDeleteModal(),
      openCurrentNoteFolderDeleteModal: () => this.sidebar.openCurrentNoteFolderDeleteModal(),
      toggleVimMode: () => this.documents.toggleVimMode(),
      setTheme: (themeId) => this.setTheme(themeId),
    });
  }

  get filteredCommands(): PaletteCommand[] {
    return filterCommands(this.paletteCommands, this.ctx.commandQuery);
  }

  normalizeSelectedCommandIndex(): void {
    this.ctx.selectedCommandIndex = clampCommandIndex(
      this.ctx.selectedCommandIndex,
      this.filteredCommands.length
    );
  }

  async focusCommandInput(): Promise<void> {
    await tick();
    this.ctx.commandInput?.focus();
  }

  preparePaletteReturnFocus(): void {
    this.ctx.paletteReturnFocus = this.focus.captureWorkspaceFocus();
  }

  togglePalette(): void {
    if (!this.ctx.paletteOpen) {
      this.ctx.paletteReturnFocus =
        this.ctx.paletteReturnFocus ?? this.focus.captureWorkspaceFocus();
      this.ctx.paletteOpen = true;
      this.ctx.commandQuery = "";
      this.ctx.selectedCommandIndex = 0;
      void this.focusCommandInput();
      return;
    }
    this.closePalette();
  }

  closePalette(): void {
    const returnFocus = this.ctx.paletteReturnFocus;
    this.ctx.paletteOpen = false;
    this.ctx.commandQuery = "";
    this.ctx.selectedCommandIndex = 0;
    this.ctx.paletteReturnFocus = undefined;
    if (this.ctx.projectIsOpen) void this.focus.restoreWorkspaceFocus(returnFocus);
  }

  setTheme(themeId: ClarosThemeId): void {
    this.ctx.activeTheme = themeId;
    saveTheme(this.ctx.environment.storage, themeId);
    if (this.ctx.appShell !== undefined)
      this.ctx.editorRuntime.applyTheme(this.ctx.appShell, themeId);
    this.ctx.editorRuntime.setTheme(themeId);
  }

  runCommand(command: PaletteCommand): void {
    if (command.disabled === true) return;
    command.run();
    this.ctx.paletteOpen = false;
    this.ctx.commandQuery = "";
    this.ctx.selectedCommandIndex = 0;
    this.ctx.paletteReturnFocus = undefined;

    if (command.focusAfter === "sidebar" && this.ctx.projectIsOpen) {
      void tick().then(() => {
        this.ctx.sidebarNav?.focus();
        this.focus.rememberSidebarFocus();
      });
      return;
    }
    if (command.focusAfter !== "none" && this.ctx.projectIsOpen) {
      void tick().then(() => this.documents.focusEditorPreservingSidebar());
    }
  }

  runSelectedCommand(): void {
    const command = this.filteredCommands[this.ctx.selectedCommandIndex];
    if (command) this.runCommand(command);
  }

  moveSelectedCommand(delta: number): void {
    if (this.filteredCommands.length === 0) {
      this.ctx.selectedCommandIndex = 0;
      return;
    }
    this.ctx.selectedCommandIndex =
      (this.ctx.selectedCommandIndex + delta + this.filteredCommands.length) %
      this.filteredCommands.length;
  }

  handleCommandInputKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelectedCommand(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSelectedCommand(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.runSelectedCommand();
    }
  }

  handleCommandInput(): void {
    this.ctx.selectedCommandIndex = 0;
  }
}
