import {
  companionConnectionFromUrl,
  loadCompanionConnection,
  saveCompanionConnection,
} from "$lib/project-session";
import { loadTheme } from "$lib/theme";
import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceFocus } from "./workspace-focus.svelte";
import type { WorkspaceOverlays } from "./workspace-overlays.svelte";
import type { WorkspacePalette } from "./workspace-palette.svelte";
import type { WorkspaceProjects } from "./workspace-projects.svelte";
import type { WorkspaceSidebarController } from "./workspace-sidebar.svelte";
import type { WorkspaceTitles } from "./workspace-titles.svelte";

export class WorkspaceLifecycle {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments,
    private readonly focus: WorkspaceFocus,
    private readonly overlays: WorkspaceOverlays,
    private readonly palette: WorkspacePalette,
    private readonly projects: WorkspaceProjects,
    private readonly sidebar: WorkspaceSidebarController,
    private readonly titles: WorkspaceTitles
  ) {}

  async mount(): Promise<void> {
    this.ctx.activeTheme = loadTheme(this.ctx.environment.storage);
    if (this.ctx.appShell !== undefined) {
      this.ctx.editorRuntime.applyTheme(this.ctx.appShell, this.ctx.activeTheme);
    }
    this.ctx.canOpenLocalProject = this.ctx.environment.canPickLocalDirectory();
    this.ctx.selectedStorageBackendId = this.ctx.canOpenLocalProject
      ? "file-picker"
      : "local-companion";
    this.ctx.companionConnection =
      companionConnectionFromUrl(this.ctx.environment.currentUrl) ??
      loadCompanionConnection(this.ctx.environment.storage);

    this.ctx.cleanupWindowListeners = [
      this.ctx.environment.addWindowListener("keydown", (event) => this.handleGlobalKeydown(event)),
      this.ctx.environment.addWindowListener("focus", () => {
        void this.focus.repairWorkspaceFocus();
      }),
    ];

    if (this.ctx.companionConnection !== undefined) {
      saveCompanionConnection(this.ctx.environment.storage, this.ctx.companionConnection);
      await this.projects.connectCompanion(this.ctx.companionConnection);
      await this.finishStartup();
      return;
    }
    this.ctx.startupReady = true;
  }

  destroy(): void {
    if (this.ctx.saveTimer !== undefined) {
      clearTimeout(this.ctx.saveTimer);
      void this.documents.flushSave();
    }
    for (const cleanup of this.ctx.cleanupWindowListeners) cleanup();
    this.ctx.dragUnsubscribe?.();
    this.ctx.manuscriptDragController?.destroy();
    this.ctx.editorRuntime.destroy();
  }

  async finishStartup(): Promise<void> {
    this.ctx.startupReady = true;
    if (this.ctx.projectIsOpen) {
      await this.documents.ensureEditor();
      this.documents.setEditorMarkdown(this.ctx.currentMarkdown);
      this.documents.focusEditorWithDefaultCursor();
    }
  }

  private handleGlobalKeydown(event: KeyboardEvent): void {
    if (this.isBackShortcut(event)) {
      if (this.ctx.projectIsOpen && this.documents.canNavigateBack) {
        event.preventDefault();
        void this.documents.navigateBack();
      }
    } else if (this.isForwardShortcut(event)) {
      if (this.ctx.projectIsOpen && this.documents.canNavigateForward) {
        event.preventDefault();
        void this.documents.navigateForward();
      }
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.palette.togglePalette();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      if (this.ctx.projectIsOpen) this.focus.toggleSidebar();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "ArrowLeft") {
      event.preventDefault();
      if (this.ctx.projectIsOpen) this.focus.focusSidebar();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "ArrowRight") {
      event.preventDefault();
      if (this.ctx.projectIsOpen) this.documents.focusEditorPreservingSidebar();
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "v"
    ) {
      event.preventDefault();
      if (this.ctx.projectIsOpen) this.documents.toggleVimMode();
    } else if (event.key === "Escape") {
      this.handleEscape(event);
    }
  }

  private isBackShortcut(event: KeyboardEvent): boolean {
    const commandKey = event.metaKey || event.ctrlKey;
    return (
      (commandKey && event.altKey && event.key === "ArrowLeft") ||
      (commandKey && !event.altKey && event.key.toLowerCase() === "o")
    );
  }

  private isForwardShortcut(event: KeyboardEvent): boolean {
    const commandKey = event.metaKey || event.ctrlKey;
    return (
      (commandKey && event.altKey && event.key === "ArrowRight") ||
      (commandKey && !event.altKey && event.key.toLowerCase() === "i")
    );
  }

  private handleEscape(event: KeyboardEvent): void {
    if (this.ctx.manuscriptDrag !== undefined) {
      event.preventDefault();
      this.ctx.manuscriptDragController?.cancel();
    } else if (this.ctx.storageBackendMenuOpen) {
      this.ctx.storageBackendMenuOpen = false;
    } else if (this.ctx.contextMenu !== undefined) {
      this.sidebar.closeSidebarContextMenu();
    } else if (this.ctx.editingProjectTitle || this.ctx.editingSidebarItemId.length > 0) {
      this.titles.cancelInlineTitleEdit();
    } else if (this.ctx.titleModal !== undefined) {
      this.titles.closeTitleModal();
    } else if (this.ctx.deleteModal !== undefined) {
      this.overlays.closeDeleteModal();
    } else if (this.ctx.confirmationModal !== undefined) {
      this.overlays.closeConfirmationModal();
    } else if (this.ctx.paletteOpen) {
      this.palette.closePalette();
    } else if (this.ctx.projectIsOpen && this.ctx.sidebarOpen) {
      this.focus.closeSidebar();
    }
  }
}
