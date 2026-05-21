import { tick } from "svelte";

import type { WorkspaceContext } from "./workspace-context.svelte";

export class WorkspaceDocuments {
  constructor(private readonly ctx: WorkspaceContext) {}

  handleEditorChange(markdown: string): void {
    if (this.ctx.suppressEditorChange || !this.ctx.projectIsOpen) {
      return;
    }
    this.ctx.currentMarkdown = markdown;
    this.ctx.saveState = "dirty";
    this.scheduleSave();
  }

  async ensureEditor(): Promise<void> {
    await tick();
    if (this.ctx.editorHost === undefined) {
      return;
    }
    this.ctx.editorRuntime.ensure({
      parent: this.ctx.editorHost,
      doc: this.ctx.currentMarkdown,
      vimMode: this.ctx.vimMode,
      theme: this.ctx.activeTheme,
      onChange: (markdown) => this.handleEditorChange(markdown),
    });
  }

  scheduleSave(): void {
    if (this.ctx.saveTimer !== undefined) {
      clearTimeout(this.ctx.saveTimer);
    }
    this.ctx.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, 550);
  }

  async flushSave(): Promise<void> {
    if (!this.ctx.project || !this.ctx.activePath) {
      return;
    }

    if (this.ctx.saveTimer !== undefined) {
      clearTimeout(this.ctx.saveTimer);
      this.ctx.saveTimer = undefined;
    }

    this.ctx.saveState = "saving";
    try {
      await this.ctx.project.writeDocument({ path: this.ctx.activePath }, this.ctx.currentMarkdown);
      this.ctx.saveState = "saved";
    } catch {
      this.ctx.saveState = "error";
    }
  }

  flushSaveWithoutWaiting(): void {
    void this.flushSave();
  }

  refreshProjectView(): void {
    this.ctx.projectRevision += 1;
  }

  setEditorMarkdown(markdown: string): void {
    this.ctx.suppressEditorChange = true;
    try {
      this.ctx.editorRuntime.setMarkdown(markdown, this.defaultCursorForActiveDocument());
    } finally {
      this.ctx.suppressEditorChange = false;
    }
  }

  async loadDocument(path: string): Promise<void> {
    if (!this.ctx.project) {
      return;
    }

    const document = await this.ctx.project.readDocument({ path });
    this.ctx.activePath = document.path;
    this.ctx.activeTitle = document.title;
    this.ctx.activeDocumentKind = document.kind;
    this.ctx.currentMarkdown = document.body;
    this.ctx.saveState = "saved";
  }

  async openDocument(
    path: string,
    options: { forceReload?: boolean; skipSave?: boolean } = {}
  ): Promise<void> {
    if (path === this.ctx.activePath && options.forceReload !== true) {
      await this.focusEditorAfterOpen();
      return;
    }

    if (options.skipSave !== true) {
      await this.flushSave();
    }
    await this.loadDocument(path);
    this.setEditorMarkdown(this.ctx.currentMarkdown);
    await this.focusEditorAfterOpen();
  }

  async focusEditorAfterOpen(): Promise<void> {
    await tick();
    this.focusEditorWithDefaultCursor();
  }

  toggleVimMode(): void {
    if (!this.ctx.projectIsOpen) {
      return;
    }
    this.ctx.vimMode = !this.ctx.vimMode;
    this.ctx.editorRuntime.setVimMode(this.ctx.vimMode);
    if (this.ctx.paletteOpen) {
      this.focusEditor();
    } else {
      this.focusEditorPreservingSidebar();
    }
  }

  focusEditor(): void {
    this.ctx.paletteOpen = false;
    this.ctx.commandQuery = "";
    this.ctx.selectedCommandIndex = 0;
    if (this.ctx.projectIsOpen) {
      this.focusEditorWithDefaultCursor();
    }
  }

  focusEditorPreservingSidebar(): void {
    this.ctx.paletteOpen = false;
    this.ctx.commandQuery = "";
    this.ctx.selectedCommandIndex = 0;
    if (this.ctx.projectIsOpen) {
      this.ctx.editorRuntime.focus();
      this.rememberEditorFocus();
    }
  }

  defaultCursorForActiveDocument(): "start" | "end" {
    return this.ctx.activeDocumentKind === "note" ? "start" : "end";
  }

  focusEditorWithDefaultCursor(): void {
    if (!this.ctx.projectIsOpen) {
      return;
    }
    this.ctx.editorRuntime.focus({ cursor: this.defaultCursorForActiveDocument() });
    this.rememberEditorFocus();
  }

  rememberEditorFocus(): void {
    if (!this.ctx.projectIsOpen || !this.ctx.editorRuntime.exists) {
      return;
    }
    this.ctx.lastWorkspaceFocus = {
      region: "editor",
      path: this.ctx.activePath,
      cursor: this.ctx.editorRuntime.getCursorPosition(),
    };
  }
}
