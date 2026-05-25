import {
  applyNamedTheme,
  createMarkdownEditor,
  type ClarosMarkdownEditor,
  type ClarosThemeId,
  type MarkdownWikilinkOptions,
} from "@claros/editor-core";

export interface MarkdownEditorRuntimeOptions {
  parent: HTMLDivElement;
  doc: string;
  documentId: string;
  vimMode: boolean;
  theme: ClarosThemeId;
  wikilinks?: MarkdownWikilinkOptions;
  onChange(markdown: string): void;
}

export class MarkdownEditorRuntime {
  private editor: ClarosMarkdownEditor | undefined;

  get exists(): boolean {
    return this.editor !== undefined;
  }

  applyTheme(element: HTMLElement, theme: ClarosThemeId): void {
    applyNamedTheme(element, theme);
  }

  ensure(options: MarkdownEditorRuntimeOptions): void {
    if (this.editor !== undefined) {
      this.editor.setTheme(options.theme);
      this.editor.setVimMode(options.vimMode);
      return;
    }
    this.editor = createMarkdownEditor(options);
  }

  setTheme(theme: ClarosThemeId): void {
    this.editor?.setTheme(theme);
  }

  setVimMode(enabled: boolean): void {
    this.editor?.setVimMode(enabled);
  }

  setMarkdown(markdown: string, cursor: "start" | "end" | number, documentId: string): void {
    this.editor?.setMarkdown(markdown, { cursor, documentId });
  }

  focus(options?: { cursor?: "start" | "end" | number }): void {
    this.editor?.focus(options);
  }

  getCursorPosition(): number {
    return this.editor?.getCursorPosition() ?? 0;
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = undefined;
  }
}

export function createMarkdownEditorRuntime(): MarkdownEditorRuntime {
  return new MarkdownEditorRuntime();
}
