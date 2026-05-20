import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from "./lib/draft";
import {
  createNewLocalProjectSession,
  firstDocumentPath,
  openCompanionProjectSession,
  openLocalProjectSession,
} from "./lib/project-session";
import { THEME_STORAGE_KEY, loadTheme, saveTheme } from "./lib/theme";
import type { DirectoryHandle } from "./lib/browser-file-system";

const pageSource = readFileSync(
  fileURLToPath(new URL("./routes/+page.svelte", import.meta.url)),
  "utf-8"
);

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("draft persistence", () => {
  it("loads the default draft when no browser draft exists", () => {
    const storage = new MemoryStorage();

    expect(loadDraft(storage)).toContain("# The Abandoned Temple");
  });

  it("saves and loads the draft markdown", () => {
    const storage = new MemoryStorage();

    saveDraft(storage, "# Scene\n\nText.");

    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe("# Scene\n\nText.");
    expect(loadDraft(storage)).toBe("# Scene\n\nText.");
  });
});

describe("theme persistence", () => {
  it("loads the default theme when no browser theme exists", () => {
    const storage = new MemoryStorage();

    expect(loadTheme(storage)).toBe("default-light");
  });

  it("saves and loads the selected theme", () => {
    const storage = new MemoryStorage();

    saveTheme(storage, "gruvbox-dark");

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("gruvbox-dark");
    expect(loadTheme(storage)).toBe("gruvbox-dark");
  });

  it("falls back to the default theme when storage contains an unknown theme", () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, "unknown-theme");

    expect(loadTheme(storage)).toBe("default-light");
  });
});

describe("project session", () => {
  it("opens a local project from browser file handles", async () => {
    const session = await openLocalProjectSession(createProjectHandle());

    expect(session.manifest.title).toBe("Browser Workspace");
    expect(session.listChapters()).toHaveLength(1);
    expect(session.listScenes()[0]?.title).toBe("Opening");
    expect(session.listNotes().map((note) => note.title)).toContain("Kareth");
  });

  it("returns the first scene path for the initial document", async () => {
    const session = await openLocalProjectSession(createProjectHandle());

    expect(firstDocumentPath(session)).toBe("manuscript/01-start/01-opening.md");
  });

  it("persists document writes to local files", async () => {
    const handle = createProjectHandle();
    const session = await openLocalProjectSession(handle);
    const path = firstDocumentPath(session);

    await session.writeDocument({ path }, "# Updated");

    expect(await readHandleFile(handle, "/manuscript/01-start/01-opening.md")).toContain(
      "# Updated"
    );
  });

  it("does not expose YAML frontmatter as editable document body", async () => {
    const session = await openLocalProjectSession(createProjectHandle());
    const document = await session.readDocument({ path: "notes/characters/kareth.md" });

    expect(document.raw).toContain("---\ntitle: Kareth");
    expect(document.body).toBe("# Kareth\n\nA cautious mercenary.");
  });

  it("preserves YAML frontmatter when writing the editable document body", async () => {
    const handle = createProjectHandle();
    const session = await openLocalProjectSession(handle);
    const path = "notes/characters/kareth.md";

    await session.writeDocument({ path }, "# Kareth\n\nUpdated body.");

    const written = await session.readDocument({ path });
    expect(written.raw).toContain("---\ntitle: Kareth");
    expect(written.raw).toContain("tags:\n  - character");
    expect(written.body).toBe("# Kareth\n\nUpdated body.");
  });

  it("creates a new project from browser file handles", async () => {
    const handle = directory("project");
    const session = await createNewLocalProjectSession(handle);

    expect(session.manifest.title).toBe("Untitled Project");
    expect(firstDocumentPath(session)).toBe("manuscript/01-draft/01-opening.md");
    expect(await readHandleFile(handle, "/claros.yaml")).toContain("Untitled Project");
  });

  it("opens and writes through the local companion API", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/api/project")) {
        return jsonResponse({
          ok: true,
          project: companionProject(),
        });
      }
      if (String(url).includes("/api/document?path=")) {
        return jsonResponse({
          ok: true,
          document: {
            path: "manuscript/01-start/01-opening.md",
            raw: "---\ntitle: Opening\n---\n\nStart.",
            body: "Start.",
            title: "Opening",
            kind: "scene",
          },
        });
      }
      if (String(url).endsWith("/api/document") && init?.method === "PUT") {
        return jsonResponse({
          ok: true,
          project: companionProject(),
          document: {
            path: "manuscript/01-start/01-opening.md",
            raw: "---\ntitle: Opening\n---\n\nUpdated.",
            body: "Updated.",
            title: "Opening",
            kind: "scene",
          },
        });
      }
      return jsonResponse({ ok: false }, 404);
    });

    const session = await openCompanionProjectSession({
      url: "http://127.0.0.1:3000",
      token: "token",
    });

    expect(session.manifest.title).toBe("Companion Workspace");
    expect((await session.readDocument({ path: firstDocumentPath(session) })).body).toBe("Start.");
    await session.writeDocument({ path: firstDocumentPath(session) }, "Updated.");
    expect(requests.at(-1)?.init?.body).toBe(
      JSON.stringify({ path: "manuscript/01-start/01-opening.md", body: "Updated." })
    );
  });
});

describe("workspace command surface", () => {
  it("removes the ambiguous return-to-manuscript command", () => {
    expect(pageSource).not.toContain("Return to Manuscript");
  });

  it("exposes a focused editor command and region focus shortcuts", () => {
    expect(pageSource).toContain("Focus Editor");
    expect(pageSource).toContain("Open Project: Local Folder");
    expect(pageSource).toContain("New Project: Local Folder");
    expect(pageSource).toContain("Open Project: Local Companion");
    expect(pageSource).toContain("New Project: Local Companion");
    expect(pageSource).not.toContain("Connect Local Companion");
    expect(pageSource).toContain('event.key === "ArrowLeft"');
    expect(pageSource).toContain('event.key === "ArrowRight"');
  });

  it("uses Phosphor icons for the storage backend launcher", () => {
    expect(pageSource).toContain("phosphor-svelte/lib/FolderOpen");
    expect(pageSource).toContain("phosphor-svelte/lib/TerminalWindow");
  });

  it("keeps no-project mode separate from the editor workspace", () => {
    expect(pageSource).toContain("{#if projectIsOpen}");
    expect(pageSource).toContain("bind:this={editorHost}");
    expect(pageSource).toContain('aria-label="Open project"');
    expect(pageSource).toContain("disabled: !localProjectSupported");
    expect(pageSource).toContain("disabled: projectCommandDisabled");
  });
});

class MemoryDirectoryHandle implements DirectoryHandle {
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
    if (existing instanceof MemoryFileHandle) {
      return existing;
    }
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
    if (existing instanceof MemoryDirectoryHandle) {
      return existing;
    }
    if (options?.create) {
      const created = new MemoryDirectoryHandle(name);
      this.entries.set(name, created);
      return created;
    }
    throw new Error(`Directory not found: ${name}`);
  }
}

class MemoryFileHandle {
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

function createProjectHandle(): MemoryDirectoryHandle {
  return directory("project", {
    "claros.yaml": file("claros.yaml", "claros: 1\ntitle: Browser Workspace\n"),
    manuscript: directory("manuscript", {
      "01-start": directory("01-start", {
        "chapter.yaml": file("chapter.yaml", "title: Start\n"),
        "01-opening.md": file("01-opening.md", "---\ntitle: Opening\n---\n\nStart."),
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

async function readHandleFile(root: DirectoryHandle, path: string): Promise<string> {
  const parts = path.split("/").filter((part) => part.length > 0);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part);
  }
  return (await (await current.getFileHandle(parts[parts.length - 1])).getFile()).text();
}

function directory(
  name: string,
  entries: Record<string, MemoryDirectoryHandle | MemoryFileHandle> = {}
): MemoryDirectoryHandle {
  return new MemoryDirectoryHandle(name, new Map(Object.entries(entries)));
}

function file(name: string, content: string): MemoryFileHandle {
  return new MemoryFileHandle(name, content);
}

function companionProject(): unknown {
  return {
    manifest: { title: "Companion Workspace" },
    chapters: [
      {
        kind: "chapter",
        id: "01-start",
        sequence: 1,
        title: "Start",
        scenes: [
          {
            kind: "scene",
            id: "01-start/01-opening",
            chapterId: "01-start",
            sequence: 1,
            title: "Opening",
            path: "manuscript/01-start/01-opening.md",
          },
        ],
      },
    ],
    notes: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
