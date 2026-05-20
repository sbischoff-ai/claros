import { describe, expect, it } from "vitest";
import type {
  ProjectDirEntry,
  ProjectFileReader,
  ProjectFileStat,
  ProjectFileWriter,
} from "@claros/story-format";
import { openProject } from "../src/browser.js";

class MemoryProjectFileSystem implements ProjectFileReader, ProjectFileWriter {
  readonly files = new Map<string, string>();

  constructor(files: Record<string, string>) {
    for (const [path, content] of Object.entries(files)) {
      this.files.set(normalize(path), content);
    }
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(normalize(path));
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async readDir(path: string): Promise<ProjectDirEntry[]> {
    const directory = normalize(path);
    const prefix = directory === "/" ? "/" : `${directory}/`;
    const entries = new Map<string, ProjectDirEntry>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }
      const remaining = filePath.slice(prefix.length);
      const [name, ...rest] = remaining.split("/");
      if (name.length === 0) {
        continue;
      }
      entries.set(name, {
        name,
        isDirectory: rest.length > 0,
      });
    }

    return [...entries.values()];
  }

  async stat(path: string): Promise<ProjectFileStat> {
    const normalized = normalize(path);
    if (this.files.has(normalized)) {
      return { exists: true, isDirectory: false };
    }
    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    return [...this.files.keys()].some((filePath) => filePath.startsWith(prefix))
      ? { exists: true, isDirectory: true }
      : { exists: false, isDirectory: false };
  }

  async writeFileAtomic(path: string, content: string): Promise<void> {
    this.files.set(normalize(path), content);
  }

  async mkdir(_path: string, _recursive = true): Promise<void> {}

  async renameFile(_fromPath: string, _toPath: string): Promise<void> {
    throw new Error("not implemented");
  }

  async removeFile(_path: string): Promise<void> {
    throw new Error("not implemented");
  }
}

describe("browser openProject", () => {
  it("opens a project through supplied file adapters", async () => {
    const fs = createProject();
    const project = await openProject("/", { fileReader: fs, fileWriter: fs });

    expect(project.manifest.title).toBe("Browser Workspace");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual(["01-start"]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/01-start/01-opening.md",
    ]);
    expect(project.listNotes().map((note) => note.path)).toEqual(["notes/characters/kareth.md"]);
  });

  it("writes documents and refreshes the in-memory index", async () => {
    const fs = createProject();
    const project = await openProject("/", { fileReader: fs, fileWriter: fs });

    await project.writeDocument(
      { path: "manuscript/01-start/01-opening.md" },
      "---\ntitle: Changed\n---\n\nUpdated body."
    );

    expect(await fs.readFile("/manuscript/01-start/01-opening.md")).toContain("Updated body.");
    expect(project.listScenes()[0]?.title).toBe("Changed");
  });

  it("reads missing macro run ledger as an empty run list", async () => {
    const fs = createProject();
    const project = await openProject("/", { fileReader: fs, fileWriter: fs });

    expect(await project.listMacroRuns()).toEqual([]);
  });
});

function createProject(): MemoryProjectFileSystem {
  return new MemoryProjectFileSystem({
    "/claros.yaml": "claros: 1\ntitle: Browser Workspace\n",
    "/manuscript/01-start/chapter.yaml": "title: Start\n",
    "/manuscript/01-start/01-opening.md": "---\ntitle: Opening\n---\n\nStart at [[Kareth]].",
    "/notes/characters/kareth.md": "---\ntitle: Kareth\n---\n\nA cautious mercenary.",
  });
}

function normalize(path: string): string {
  const normalized = `/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
  return normalized.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
