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
const workspaceSource = [
  "./routes/+page.svelte",
  "./routes/page.css",
  "./lib/ActionMenu.svelte",
  "./lib/CommandPalette.svelte",
  "./lib/components/workspace/ProjectEmptyState.svelte",
  "./lib/components/workspace/SidebarTab.svelte",
  "./lib/components/workspace/WorkspaceApp.svelte",
  "./lib/components/workspace/WorkspaceEditorFrame.svelte",
  "./lib/components/workspace/WorkspaceOverlays.svelte",
  "./lib/components/workspace/WorkspaceTitleControl.svelte",
  "./lib/components/workspace/WorkspaceTopbar.svelte",
  "./lib/ConfirmationModal.svelte",
  "./lib/DeleteModal.svelte",
  "./lib/directional-navigation.ts",
  "./lib/ManuscriptDragPreview.svelte",
  "./lib/manuscript-drag.ts",
  "./lib/ProjectLauncher.svelte",
  "./lib/TitleModal.svelte",
  "./lib/WorkspaceSidebar.svelte",
  "./lib/sidebar-model.ts",
  "./lib/services/browser-environment.ts",
  "./lib/services/markdown-editor-runtime.ts",
  "./lib/state/action-menu-controller.svelte.ts",
  "./lib/state/workspace-context.svelte.ts",
  "./lib/state/workspace-controller.svelte.ts",
  "./lib/state/workspace-controller-types.ts",
  "./lib/state/workspace-documents.svelte.ts",
  "./lib/state/workspace-focus.svelte.ts",
  "./lib/state/workspace-lifecycle.svelte.ts",
  "./lib/state/workspace-manuscript-actions.svelte.ts",
  "./lib/state/workspace-overlays.svelte.ts",
  "./lib/state/workspace-palette.svelte.ts",
  "./lib/state/workspace-projects.svelte.ts",
  "./lib/state/workspace-sidebar.svelte.ts",
  "./lib/state/workspace-titles.svelte.ts",
  "./lib/storage-backends.ts",
  "./lib/text-format.ts",
  "./lib/title-model.ts",
  "./lib/workspace-commands.ts",
  "./lib/workspace-view-model.ts",
  "./lib/workspace-types.ts",
]
  .map((path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf-8"))
  .join("\n");
const appHtmlSource = readFileSync(fileURLToPath(new URL("./app.html", import.meta.url)), "utf-8");

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

  it("bootstraps persisted theme colors before Svelte renders", () => {
    expect(appHtmlSource).toContain('"claros.theme"');
    expect(appHtmlSource).toContain('"gruvbox-dark": ["#1d2021", "#d5c4a1"]');
    expect(appHtmlSource).toContain("--claros-app-background");
    expect(appHtmlSource).toContain("--claros-prose-text");
    expect(appHtmlSource).toContain("--claros-startup-spinner");
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

    expect(firstDocumentPath(session)).toBe("manuscript/001-start/001-opening.md");
  });

  it("persists document writes to local files", async () => {
    const handle = createProjectHandle();
    const session = await openLocalProjectSession(handle);
    const path = firstDocumentPath(session);

    await session.writeDocument({ path }, "# Updated");

    expect(await readHandleFile(handle, "/manuscript/001-start/001-opening.md")).toContain(
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

  it("resolves local wikilinks through the project session boundary", async () => {
    const session = await openLocalProjectSession(createProjectHandle());

    await expect(
      session.resolveWikilink("Kareth", "manuscript/001-start/001-opening.md")
    ).resolves.toMatchObject({
      status: "resolved",
      path: "notes/characters/kareth.md",
      reason: "title",
    });
    await expect(session.resolveWikilink("Missing Note")).resolves.toMatchObject({
      status: "unresolved",
      target: "Missing Note",
    });
  });

  it("does not add leading blank lines when saving a body that starts empty", async () => {
    const handle = createProjectHandle();
    const session = await openLocalProjectSession(handle);
    const path = firstDocumentPath(session);
    const document = await session.readDocument({ path });

    await session.writeDocument({ path }, document.body);
    await session.writeDocument({ path }, document.body);

    expect(await readHandleFile(handle, "/manuscript/001-start/001-opening.md")).toBe(
      "---\ntitle: Opening\n---\n\nStart."
    );
  });

  it("creates a new project from browser file handles", async () => {
    const handle = directory("project");
    const session = await createNewLocalProjectSession(handle, "Browser Draft");

    expect(session.manifest.title).toBe("Browser Draft");
    expect(firstDocumentPath(session)).toBe("manuscript/001-draft/001-opening.md");
    expect(await readHandleFile(handle, "/claros.yaml")).toContain("Browser Draft");
  });

  it("mutates local project titles and manuscript structure", async () => {
    const handle = createProjectHandle();
    const session = await openLocalProjectSession(handle);

    await session.setProjectTitle("Renamed Workspace");
    const chapterScene = await session.appendChapter("Second Act");
    const appendedScene = await session.appendScene("");
    await session.setChapterTitle("001-start", "");
    const renamedScene = await session.setSceneTitle(
      "manuscript/001-chapter-1/001-opening.md",
      "A New Opening"
    );

    expect(session.manifest.title).toBe("Renamed Workspace");
    expect(chapterScene.path).toBe("manuscript/002-second-act/002-scene-2.md");
    expect(appendedScene.path).toBe("manuscript/002-second-act/003-scene-3.md");
    expect(renamedScene.path).toBe("manuscript/001-chapter-1/001-a-new-opening.md");
    expect(session.listChapters().map((chapter) => chapter.title)).toEqual([
      "Chapter 1",
      "Second Act",
    ]);
    expect(session.listScenes().map((scene) => scene.title)).toEqual([
      "A New Opening",
      "Scene 2",
      "Scene 3",
    ]);

    const nextPath = await session.deleteScene("manuscript/001-chapter-1/001-a-new-opening.md");
    expect(nextPath).toBe("manuscript/001-second-act/001-scene-1.md");
    expect(session.listChapters().map((chapter) => chapter.id)).toEqual(["001-second-act"]);
  });

  it("inserts local chapters and scenes before and after workspace targets", async () => {
    const handle = createProjectHandle();
    const session = await openLocalProjectSession(handle);

    await session.appendChapter("Finale");
    const scene = await session.createScene("Interlude", {
      placement: "before",
      targetScenePath: "manuscript/001-start/001-opening.md",
    });
    const chapterScene = await session.createChapter("Middle Act", "Bridge", {
      placement: "after",
      targetChapterId: "001-start",
    });

    expect(scene.path).toBe("manuscript/001-start/001-interlude.md");
    expect(chapterScene.path).toBe("manuscript/002-middle-act/003-bridge.md");
    expect(session.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-start",
      "002-middle-act",
      "003-finale",
    ]);
    expect(session.listScenes().map((entry) => entry.path)).toEqual([
      "manuscript/001-start/001-interlude.md",
      "manuscript/001-start/002-opening.md",
      "manuscript/002-middle-act/003-bridge.md",
      "manuscript/003-finale/004-scene-4.md",
    ]);

    const movedScene = await session.moveScene("manuscript/002-middle-act/003-bridge.md", {
      placement: "before",
      targetScenePath: "manuscript/001-start/001-interlude.md",
    });
    expect(movedScene.scene.path).toBe("manuscript/001-start/001-bridge.md");
    expect(movedScene.pathMap["manuscript/001-start/001-interlude.md"]).toBe(
      "manuscript/001-start/002-interlude.md"
    );
  });

  it("preserves the surviving scene body when deletion resequences it to the deleted path", async () => {
    const handle = createTwoSceneDefaultSlugProjectHandle();
    const session = await openLocalProjectSession(handle);

    const nextPath = await session.deleteScene("manuscript/001-draft/001-scene-1.md");
    const nextDocument = await session.readDocument({ path: nextPath });

    expect(nextPath).toBe("manuscript/001-draft/001-scene-1.md");
    expect(nextDocument.body).toContain("Second scene body.");
    expect(nextDocument.body).not.toContain("First scene body.");
    expect(await readHandleFile(handle, "/manuscript/001-draft/001-scene-1.md")).toContain(
      "Second scene body."
    );
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
            path: "manuscript/001-start/001-opening.md",
            raw: "---\ntitle: Opening\n---\n\nStart.",
            body: "Start.",
            title: "Opening",
            kind: "scene",
          },
        });
      }
      if (String(url).includes("/api/wikilink?")) {
        return jsonResponse({
          ok: true,
          resolution: {
            status: "resolved",
            path: "notes/characters/kareth.md",
            reason: "title",
          },
        });
      }
      if (String(url).endsWith("/api/document") && init?.method === "PUT") {
        return jsonResponse({
          ok: true,
          project: companionProject(),
          document: {
            path: "manuscript/001-start/001-opening.md",
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
    await expect(
      session.resolveWikilink("Kareth", firstDocumentPath(session))
    ).resolves.toMatchObject({
      status: "resolved",
      path: "notes/characters/kareth.md",
    });
    await session.writeDocument({ path: firstDocumentPath(session) }, "Updated.");
    expect(requests.at(-1)?.init?.body).toBe(
      JSON.stringify({ path: "manuscript/001-start/001-opening.md", body: "Updated." })
    );
  });

  it("moves companion chapters and scenes through mutation requests", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestBody =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      if (String(url).endsWith("/api/project")) {
        return jsonResponse({
          ok: true,
          project: companionProjectWithTwoChapters(),
        });
      }
      if (String(url).endsWith("/api/project/mutation") && requestBody.action === "move-chapter") {
        return jsonResponse({
          ok: true,
          project: companionProjectAfterChapterMove(),
          chapter: companionProjectAfterChapterMove().chapters[0],
          pathMap: {
            "manuscript/002-finale/002-ending.md": "manuscript/001-finale/001-ending.md",
            "manuscript/001-start/001-opening.md": "manuscript/002-start/002-opening.md",
          },
          chapterIdMap: {
            "002-finale": "001-finale",
            "001-start": "002-start",
          },
        });
      }
      if (String(url).endsWith("/api/project/mutation") && requestBody.action === "move-scene") {
        return jsonResponse({
          ok: true,
          project: companionProjectAfterSceneMove(),
          scene: companionProjectAfterSceneMove().chapters[0].scenes[1],
          pathMap: {
            "manuscript/002-start/002-opening.md": "manuscript/001-finale/002-opening.md",
          },
          chapterIdMap: {},
        });
      }
      return jsonResponse({ ok: false }, 404);
    });

    const session = await openCompanionProjectSession({
      url: "http://127.0.0.1:3000",
      token: "token",
    });

    const movedChapter = await session.moveChapter("002-finale", {
      placement: "before",
      targetChapterId: "001-start",
    });
    expect(movedChapter.chapter.id).toBe("001-finale");
    expect(session.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-finale",
      "002-start",
    ]);
    expect(movedChapter.pathMap["manuscript/001-start/001-opening.md"]).toBe(
      "manuscript/002-start/002-opening.md"
    );

    const movedScene = await session.moveScene("manuscript/002-start/002-opening.md", {
      placement: "after",
      targetScenePath: "manuscript/001-finale/001-ending.md",
    });
    expect(movedScene.scene.path).toBe("manuscript/001-finale/002-opening.md");
    expect(session.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-finale/001-ending.md",
      "manuscript/001-finale/002-opening.md",
    ]);
  });
});

describe("workspace command surface", () => {
  it("keeps the top-level page as a small controller/bootstrap boundary", () => {
    expect(pageSource.split("\n").length).toBeLessThan(50);
    expect(pageSource).toContain("createWorkspaceControllers()");
    expect(pageSource).toContain("<WorkspaceApp {controllers} />");
  });

  it("removes the ambiguous return-to-manuscript command", () => {
    expect(pageSource).not.toContain("Return to Manuscript");
  });

  it("passes feature-scoped controllers instead of a broad workspace controller", () => {
    expect(workspaceSource).toContain("WorkspaceLifecycleSurface");
    expect(workspaceSource).toContain("WorkspaceSidebarSurface");
    expect(workspaceSource).toContain("WorkspaceOverlaysSurface");
    expect(workspaceSource).not.toContain("interface WorkspaceController ");
    expect(workspaceSource).not.toContain("new Proxy");
    expect(workspaceSource).not.toContain("createWorkspaceFacade");
    expect(workspaceSource).not.toContain("WorkspaceController } from");
  });

  it("keeps no-project and startup rendering separate from the editor workspace", () => {
    expect(workspaceSource).toContain("{#if lifecycle.projectIsOpen}");
    expect(workspaceSource).toContain("bind:this={lifecycle.appShell}");
    expect(workspaceSource).toContain("bind:this={controller.editorHost}");
    expect(workspaceSource).toContain('aria-label="Open project"');
    expect(workspaceSource).toContain('class="startup-screen"');
    expect(workspaceSource).toContain('class="startup-spinner"');
  });

  it("renders editor file history navigation with arrow icons", () => {
    expect(workspaceSource).toContain("phosphor-svelte/lib/ArrowLeft");
    expect(workspaceSource).toContain("phosphor-svelte/lib/ArrowRight");
    expect(workspaceSource).toContain('aria-label="Open previous file"');
    expect(workspaceSource).toContain('aria-label="Open next file"');
    expect(workspaceSource).toContain("disabled={!controller.canNavigateBack}");
    expect(workspaceSource).toContain("disabled={!controller.canNavigateForward}");
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

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    this.entries.delete(name);
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
      "001-start": directory("001-start", {
        "chapter.yaml": file("chapter.yaml", "title: Start\n"),
        "001-opening.md": file("001-opening.md", "---\ntitle: Opening\n---\n\nStart."),
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

function createTwoSceneDefaultSlugProjectHandle(): MemoryDirectoryHandle {
  return directory("project", {
    "claros.yaml": file("claros.yaml", "claros: 1\ntitle: Browser Workspace\n"),
    manuscript: directory("manuscript", {
      "001-draft": directory("001-draft", {
        "chapter.yaml": file("chapter.yaml", "title: Draft\n"),
        "001-scene-1.md": file("001-scene-1.md", "---\ntitle: First\n---\n\nFirst scene body."),
        "002-scene-2.md": file("002-scene-2.md", "---\ntitle: Second\n---\n\nSecond scene body."),
      }),
    }),
    notes: directory("notes"),
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
        id: "001-start",
        sequence: 1,
        title: "Start",
        scenes: [
          {
            kind: "scene",
            id: "001-start/001-opening",
            chapterId: "001-start",
            sequence: 1,
            title: "Opening",
            path: "manuscript/001-start/001-opening.md",
          },
        ],
      },
    ],
    notes: [],
  };
}

function companionProjectWithTwoChapters() {
  return {
    manifest: { title: "Companion Workspace" },
    chapters: [
      {
        kind: "chapter",
        id: "001-start",
        sequence: 1,
        title: "Start",
        scenes: [
          {
            kind: "scene",
            id: "001-start/001-opening",
            chapterId: "001-start",
            sequence: 1,
            title: "Opening",
            path: "manuscript/001-start/001-opening.md",
          },
        ],
      },
      {
        kind: "chapter",
        id: "002-finale",
        sequence: 2,
        title: "Finale",
        scenes: [
          {
            kind: "scene",
            id: "002-finale/002-ending",
            chapterId: "002-finale",
            sequence: 2,
            title: "Ending",
            path: "manuscript/002-finale/002-ending.md",
          },
        ],
      },
    ],
    notes: [],
  };
}

function companionProjectAfterChapterMove() {
  return {
    manifest: { title: "Companion Workspace" },
    chapters: [
      {
        kind: "chapter",
        id: "001-finale",
        sequence: 1,
        title: "Finale",
        scenes: [
          {
            kind: "scene",
            id: "001-finale/001-ending",
            chapterId: "001-finale",
            sequence: 1,
            title: "Ending",
            path: "manuscript/001-finale/001-ending.md",
          },
        ],
      },
      {
        kind: "chapter",
        id: "002-start",
        sequence: 2,
        title: "Start",
        scenes: [
          {
            kind: "scene",
            id: "002-start/002-opening",
            chapterId: "002-start",
            sequence: 2,
            title: "Opening",
            path: "manuscript/002-start/002-opening.md",
          },
        ],
      },
    ],
    notes: [],
  };
}

function companionProjectAfterSceneMove() {
  return {
    manifest: { title: "Companion Workspace" },
    chapters: [
      {
        kind: "chapter",
        id: "001-finale",
        sequence: 1,
        title: "Finale",
        scenes: [
          {
            kind: "scene",
            id: "001-finale/001-ending",
            chapterId: "001-finale",
            sequence: 1,
            title: "Ending",
            path: "manuscript/001-finale/001-ending.md",
          },
          {
            kind: "scene",
            id: "001-finale/002-opening",
            chapterId: "001-finale",
            sequence: 2,
            title: "Opening",
            path: "manuscript/001-finale/002-opening.md",
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
