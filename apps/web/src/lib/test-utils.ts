import type { ClarosThemeId } from "@claros/editor-core";
import type { DirectoryHandle } from "./browser-file-system";
import { BrowserEnvironment } from "./services/browser-environment";
import {
  MarkdownEditorRuntime,
  type MarkdownEditorRuntimeOptions,
} from "./services/markdown-editor-runtime";

export class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

export class FakeBrowserEnvironment extends BrowserEnvironment {
  readonly memoryStorage = new MemoryStorage();
  testCurrentUrl = new URL("http://localhost/");
  testActiveElement: Element | null = null;
  localDirectorySupported = true;
  pickedDirectory: DirectoryHandle = createProjectHandle();
  prompts: string[] = [];
  readonly listeners: Array<{ type: keyof WindowEventMap; listener: (event: Event) => void }> = [];

  override get storage(): MemoryStorage {
    return this.memoryStorage;
  }

  override get currentUrl(): URL {
    return this.testCurrentUrl;
  }

  override get activeElement(): Element | null {
    return this.testActiveElement;
  }

  canPickLocalDirectory(): boolean {
    return this.localDirectorySupported;
  }

  async pickWritableDirectory(): Promise<DirectoryHandle> {
    return this.pickedDirectory;
  }

  prompt(_label: string, value = ""): string | null {
    return this.prompts.shift() ?? value;
  }

  querySelector<T extends Element>(_selector: string): T | null {
    return null;
  }

  addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void
  ): () => void {
    const entry = { type, listener: listener as (event: Event) => void };
    this.listeners.push(entry);
    return () => {
      const index = this.listeners.indexOf(entry);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  dispatchWindowEvent(event: Event): void {
    for (const entry of this.listeners) {
      if (entry.type === event.type) entry.listener(event);
    }
  }
}

export class FakeMarkdownEditorRuntime extends MarkdownEditorRuntime {
  ensured = false;
  destroyed = false;
  markdown = "";
  vimMode = false;
  theme: ClarosThemeId = "default-light";
  focusedWith: { cursor?: "start" | "end" | number } | undefined;
  appliedThemes: Array<{ element: HTMLElement; theme: ClarosThemeId }> = [];
  wikilinks: MarkdownEditorRuntimeOptions["wikilinks"] | undefined;
  private onChange: ((markdown: string) => void) | undefined;

  override get exists(): boolean {
    return this.ensured;
  }

  override applyTheme(element: HTMLElement, theme: ClarosThemeId): void {
    this.appliedThemes.push({ element, theme });
  }

  override ensure(options: MarkdownEditorRuntimeOptions): void {
    this.ensured = true;
    this.markdown = options.doc;
    this.vimMode = options.vimMode;
    this.theme = options.theme;
    this.wikilinks = options.wikilinks;
    this.onChange = options.onChange;
  }

  override setTheme(theme: ClarosThemeId): void {
    this.theme = theme;
  }

  override setVimMode(enabled: boolean): void {
    this.vimMode = enabled;
  }

  override setMarkdown(markdown: string, _cursor: "start" | "end"): void {
    this.markdown = markdown;
  }

  override focus(options?: { cursor?: "start" | "end" | number }): void {
    this.focusedWith = options;
  }

  override getCursorPosition(): number {
    return 7;
  }

  override destroy(): void {
    this.destroyed = true;
    this.ensured = false;
  }

  emitChange(markdown: string): void {
    this.onChange?.(markdown);
  }
}

export class MemoryDirectoryHandle implements DirectoryHandle {
  readonly kind = "directory";

  constructor(
    readonly name: string,
    private readonly entries = new Map<string, MemoryDirectoryHandle | MemoryFileHandle>()
  ) {}

  async *values(): AsyncIterable<MemoryDirectoryHandle | MemoryFileHandle> {
    yield* this.entries.values();
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandle> {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryFileHandle) return existing;
    if (options?.create) {
      const created = new MemoryFileHandle(name, "");
      this.entries.set(name, created);
      return created;
    }
    throw new Error(`File not found: ${name}`);
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<MemoryDirectoryHandle> {
    const existing = this.entries.get(name);
    if (existing instanceof MemoryDirectoryHandle) return existing;
    if (options?.create) {
      const created = new MemoryDirectoryHandle(name);
      this.entries.set(name, created);
      return created;
    }
    throw new Error(`Directory not found: ${name}`);
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    this.entries.delete(name);
  }
}

export class MemoryFileHandle {
  readonly kind = "file";

  constructor(
    readonly name: string,
    private content: string
  ) {}

  async getFile(): Promise<File> {
    return new File([this.content], this.name, { type: "text/markdown" });
  }

  async createWritable(): Promise<{
    write: (content: string) => Promise<void>;
    close: () => Promise<void>;
  }> {
    return {
      write: async (content: string) => {
        this.content = content;
      },
      close: async () => undefined,
    };
  }
}

export function createProjectHandle(): MemoryDirectoryHandle {
  return directory("project", {
    "claros.yaml": file("claros.yaml", "claros: 1\ntitle: Browser Workspace\n"),
    manuscript: directory("manuscript", {
      "001-start": directory("001-start", {
        "chapter.yaml": file("chapter.yaml", "title: Start\n"),
        "001-opening.md": file("001-opening.md", "---\ntitle: Opening\n---\n\nStart."),
        "002-second.md": file("002-second.md", "---\ntitle: Second\n---\n\nSecond."),
      }),
    }),
    notes: directory("notes", {
      characters: directory("characters", {
        "kareth.md": file(
          "kareth.md",
          "---\ntitle: Kareth\ntags:\n  - character\n---\n# Kareth\n\nA cautious mercenary."
        ),
      }),
    }),
  });
}

export async function readHandleFile(root: DirectoryHandle, path: string): Promise<string> {
  const parts = path.split("/").filter((part) => part.length > 0);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part);
  }
  return (await (await current.getFileHandle(parts[parts.length - 1])).getFile()).text();
}

export function directory(
  name: string,
  entries: Record<string, MemoryDirectoryHandle | MemoryFileHandle> = {}
): MemoryDirectoryHandle {
  return new MemoryDirectoryHandle(name, new Map(Object.entries(entries)));
}

export function file(name: string, content: string): MemoryFileHandle {
  return new MemoryFileHandle(name, content);
}
