import { tick } from "svelte";
import type {
  MarkdownWikilinkOptions,
  MarkdownWikilinkReference,
  MarkdownWikilinkResolution,
} from "@claros/editor-core";

import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceLinkResolution } from "$lib/project-session";
import {
  buildManuscriptChapterFlow,
  updateCurrentManuscriptFlowMarkdown,
} from "$lib/manuscript-flow";

export class WorkspaceDocuments {
  openWikilinkCreateModal: ((target: string) => void) | undefined;

  constructor(private readonly ctx: WorkspaceContext) {}

  get canNavigateBack(): boolean {
    return this.ctx.documentTrailIndex > 0;
  }

  get canNavigateForward(): boolean {
    return this.ctx.documentTrailIndex < this.ctx.documentTrail.length - 1;
  }

  handleEditorChange(markdown: string): void {
    if (this.ctx.suppressEditorChange || !this.ctx.projectIsOpen) {
      return;
    }
    this.ctx.currentMarkdown = markdown;
    this.ctx.manuscriptChapterFlow = updateCurrentManuscriptFlowMarkdown(
      this.ctx.manuscriptChapterFlow,
      this.ctx.activePath,
      markdown
    );
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
      documentId: this.ctx.activePath,
      vimMode: this.ctx.vimMode,
      theme: this.ctx.activeTheme,
      wikilinks: this.wikilinkOptions(),
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
      this.ctx.editorRuntime.setMarkdown(
        markdown,
        this.defaultCursorForActiveDocument(),
        this.ctx.activePath
      );
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
    this.ctx.manuscriptChapterFlow = await buildManuscriptChapterFlow({
      chapters: this.ctx.chapters,
      scenes: this.ctx.scenes,
      activePath: document.path,
      activeMarkdown: document.body,
      readDocument: (ref) => this.ctx.project!.readDocument(ref),
    });
    this.ctx.saveState = "saved";
  }

  async openDocument(
    path: string,
    options: {
      forceReload?: boolean;
      skipSave?: boolean;
      history?: "record" | "replace" | "preserve";
    } = {}
  ): Promise<void> {
    if (path === this.ctx.activePath && options.forceReload !== true) {
      await this.focusEditorAfterOpen();
      return;
    }

    if (options.skipSave !== true) {
      await this.flushSave();
    }
    await this.loadDocument(path);
    this.updateDocumentTrail(path, options.history ?? "record");
    this.setEditorMarkdown(this.ctx.currentMarkdown);
    await this.focusEditorAfterOpen();
  }

  async navigateBack(): Promise<void> {
    if (!this.canNavigateBack) {
      return;
    }
    await this.openDocument(this.ctx.documentTrail[this.ctx.documentTrailIndex - 1], {
      history: "preserve",
    });
    this.ctx.documentTrailIndex -= 1;
  }

  async navigateForward(): Promise<void> {
    if (!this.canNavigateForward) {
      return;
    }
    await this.openDocument(this.ctx.documentTrail[this.ctx.documentTrailIndex + 1], {
      history: "preserve",
    });
    this.ctx.documentTrailIndex += 1;
  }

  resetDocumentTrail(path: string): void {
    this.ctx.documentTrail = path.length > 0 ? [path] : [];
    this.ctx.documentTrailIndex = this.ctx.documentTrail.length - 1;
  }

  replaceCurrentDocumentInTrail(path: string): void {
    this.updateDocumentTrail(path, "replace");
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

  defaultCursorForActiveDocument(): "start" | "end" | number {
    return this.ctx.activeDocumentKind === "note"
      ? cursorAfterFirstHeading(this.ctx.currentMarkdown)
      : "end";
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

  private wikilinkOptions(): MarkdownWikilinkOptions {
    return {
      currentPath: () => this.ctx.activePath || undefined,
      resolve: async (reference, fromPath) => {
        const resolution = await this.ctx.project?.resolveWikilink(reference.raw, fromPath);
        return toMarkdownWikilinkResolution(
          resolution ?? { status: "unresolved", target: reference.target }
        );
      },
      preview: async (path) => {
        if (this.ctx.project === undefined) {
          return { path, title: path, excerpt: "" };
        }
        const document = await this.ctx.project.readDocument({ path });
        return {
          path,
          title: document.title,
          excerpt: excerptFromMarkdown(document.body),
        };
      },
      open: async (path) => {
        await this.openWikilinkPath(path);
      },
      create: async (_reference: MarkdownWikilinkReference, _fromPath, target) => {
        await this.flushSave();
        this.openWikilinkCreateModal?.(target);
      },
    };
  }

  private async openWikilinkPath(path: string): Promise<void> {
    await this.flushSave();
    await this.openDocument(path);
  }

  private updateDocumentTrail(path: string, mode: "record" | "replace" | "preserve"): void {
    if (mode === "preserve") {
      return;
    }
    if (mode === "replace") {
      if (this.ctx.documentTrailIndex === -1) {
        this.resetDocumentTrail(path);
        return;
      }
      const next = this.ctx.documentTrail.slice(0, this.ctx.documentTrailIndex + 1);
      next[this.ctx.documentTrailIndex] = path;
      this.ctx.documentTrail = next;
      return;
    }
    if (this.ctx.documentTrail[this.ctx.documentTrailIndex] === path) {
      return;
    }
    this.ctx.documentTrail = this.ctx.documentTrail
      .slice(0, this.ctx.documentTrailIndex + 1)
      .concat(path);
    this.ctx.documentTrailIndex = this.ctx.documentTrail.length - 1;
  }
}

function toMarkdownWikilinkResolution(
  resolution: WorkspaceLinkResolution
): MarkdownWikilinkResolution {
  if (resolution.status === "resolved") {
    return { status: "resolved", path: resolution.path, reason: resolution.reason };
  }
  if (resolution.status === "ambiguous") {
    return {
      status: "ambiguous",
      target: resolution.target,
      reason: resolution.reason,
      candidates: resolution.candidates.map((candidate) => ({
        path: candidate.path,
        title: candidate.title,
      })),
    };
  }
  return { status: "unresolved", target: resolution.target };
}

function excerptFromMarkdown(markdown: string): string {
  const text = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  return text.length <= 180 ? text : `${text.slice(0, 177).trimEnd()}...`;
}

function cursorAfterFirstHeading(markdown: string): number {
  const firstLineEnd = markdown.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? markdown : markdown.slice(0, firstLineEnd);
  if (!/^#{1,6}\s+\S/.test(firstLine)) {
    return 0;
  }
  if (firstLineEnd === -1) {
    return markdown.length;
  }
  return firstLineEnd + 1;
}
