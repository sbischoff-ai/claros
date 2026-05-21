import { tick } from "svelte";
import type { MarkdownEditorCursor } from "@claros/editor-core";

import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";
import type { WorkspaceFocusTarget } from "$lib/workspace-types";

export class WorkspaceFocus {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments
  ) {}

  rememberSidebarFocus(itemId = this.ctx.focusedSidebarItemId): void {
    if (!this.ctx.projectIsOpen || itemId.length === 0) {
      return;
    }
    this.ctx.lastWorkspaceFocus = { region: "sidebar", itemId };
  }

  captureWorkspaceFocus(): WorkspaceFocusTarget | undefined {
    const activeElement = this.ctx.environment.activeElement;
    if (activeElement !== null && this.ctx.editorHost?.contains(activeElement)) {
      this.documents.rememberEditorFocus();
      return this.ctx.lastWorkspaceFocus;
    }
    if (activeElement !== null && this.ctx.sidebarNav?.contains(activeElement)) {
      this.rememberSidebarFocus();
      return this.ctx.lastWorkspaceFocus;
    }
    return this.ctx.lastWorkspaceFocus;
  }

  async restoreWorkspaceFocus(target = this.ctx.lastWorkspaceFocus): Promise<void> {
    if (!this.ctx.projectIsOpen || this.hasTransientFocus()) {
      return;
    }
    await tick();
    if (
      target?.region === "sidebar" &&
      this.ctx.sidebarOpen &&
      this.ctx.sidebarItems.some((item) => item.id === target.itemId)
    ) {
      this.ctx.focusedSidebarItemId = target.itemId;
      this.ctx.sidebarNav?.focus();
      this.rememberSidebarFocus(target.itemId);
      return;
    }
    if (target?.region === "editor" && target.path === this.ctx.activePath) {
      this.ctx.editorRuntime.focus({ cursor: target.cursor as MarkdownEditorCursor });
      this.documents.rememberEditorFocus();
      return;
    }
    this.documents.focusEditorWithDefaultCursor();
  }

  async repairWorkspaceFocus(): Promise<void> {
    if (!this.ctx.projectIsOpen || this.hasTransientFocus()) {
      return;
    }
    await tick();
    const activeElement = this.ctx.environment.activeElement;
    if (
      activeElement !== null &&
      (this.ctx.editorHost?.contains(activeElement) || this.ctx.sidebarNav?.contains(activeElement))
    ) {
      return;
    }
    await this.restoreWorkspaceFocus();
  }

  hasTransientFocus(): boolean {
    return (
      this.ctx.paletteOpen ||
      this.ctx.titleModal !== undefined ||
      this.ctx.deleteModal !== undefined ||
      this.ctx.confirmationModal !== undefined ||
      this.ctx.contextMenu !== undefined ||
      this.ctx.editingProjectTitle ||
      this.ctx.editingSidebarItemId.length > 0
    );
  }

  focusSidebar(): void {
    if (!this.ctx.projectIsOpen) {
      return;
    }
    this.ctx.paletteOpen = false;
    this.ctx.commandQuery = "";
    this.ctx.selectedCommandIndex = 0;
    if (!this.ctx.sidebarOpen) {
      this.ctx.sidebarOpen = true;
    }
    this.ctx.focusedSidebarItemId = this.ctx.activePath || this.ctx.sidebarItems[0]?.id || "";
    void tick().then(() => {
      this.ctx.sidebarNav?.focus();
      this.rememberSidebarFocus();
    });
  }

  toggleSidebar(): void {
    if (!this.ctx.projectIsOpen) {
      return;
    }
    this.ctx.sidebarOpen = !this.ctx.sidebarOpen;
    if (this.ctx.sidebarOpen) {
      this.ctx.focusedSidebarItemId = this.ctx.activePath || this.ctx.sidebarItems[0]?.id || "";
      void tick().then(() => {
        this.ctx.sidebarNav?.focus();
        this.rememberSidebarFocus();
      });
    } else {
      this.documents.focusEditorPreservingSidebar();
    }
  }

  closeSidebar(): void {
    this.ctx.sidebarOpen = false;
    if (this.ctx.projectIsOpen) {
      this.documents.focusEditorPreservingSidebar();
    }
  }
}
