import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractClarosBlocks,
  extractWikilinks,
  parseMarkdownDocument,
  scanProjectFormat,
  type ProjectDirEntry,
  type ProjectFileReader,
  type ProjectFileStat,
} from "../src/index.js";

class NodeProjectFileReader implements ProjectFileReader {
  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
  }

  async readDir(dirPath: string): Promise<ProjectDirEntry[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  }

  async stat(filePath: string): Promise<ProjectFileStat> {
    try {
      const stats = await lstat(filePath);
      return {
        exists: true,
        isDirectory: stats.isDirectory(),
      };
    } catch {
      return {
        exists: false,
        isDirectory: false,
      };
    }
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createProjectRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "claros-iter09-"));
  tempDirs.push(dir);
  return dir;
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

describe("parseMarkdownDocument", () => {
  it("parses a markdown document into raw, frontmatter, and body", () => {
    const raw = ["---", "title: Opening", "---", "", "# Opening"].join("\n");

    expect(parseMarkdownDocument("manuscript/01-prologue/01-opening.md", raw)).toEqual({
      path: "manuscript/01-prologue/01-opening.md",
      raw,
      frontmatter: { title: "Opening" },
      body: "\n# Opening",
    });
  });
});

describe("extractWikilinks", () => {
  it("extracts Obsidian wikilinks with aliases", () => {
    const raw = "Before [[Ancient Ruin]] and [[North Gate|The Gate]].";

    const links = extractWikilinks("notes/places.md", raw);

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      raw: "[[Ancient Ruin]]",
      target: "Ancient Ruin",
      alias: undefined,
      fromPath: "notes/places.md",
    });
    expect(links[0].range.start).toEqual({ line: 1, column: 8, offset: 7 });
    expect(links[1]).toMatchObject({
      raw: "[[North Gate|The Gate]]",
      target: "North Gate",
      alias: "The Gate",
      fromPath: "notes/places.md",
    });
  });
});

describe("extractClarosBlocks", () => {
  it("extracts [!claros] blocks and run IDs", () => {
    const raw = [
      "> [!claros] Oracle Check",
      "> roll: 2d6",
      "> result: unclear",
      "> [claros-run: run_123]",
    ].join("\n");

    const blocks = extractClarosBlocks("manuscript/01-prologue/01-opening.md", raw);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "claros-block",
      fromPath: "manuscript/01-prologue/01-opening.md",
      title: "Oracle Check",
      runId: "run_123",
      raw,
    });
    expect(blocks[0].range.start).toEqual({ line: 1, column: 1, offset: 0 });
  });

  it("does not treat other Obsidian callout types as Claros blocks", () => {
    const raw = ["> [!note] Scratchpad", "> [claros-run: ignored]"].join("\n");

    expect(extractClarosBlocks("notes/session.md", raw)).toEqual([]);
  });

  it("does not treat a blockquote with a run marker but without [!claros] as a Claros block", () => {
    const raw = ["> this is just a blockquote", "> [claros-run: ignored]"].join("\n");

    expect(extractClarosBlocks("notes/session.md", raw)).toEqual([]);
  });

  it("does not require [!claros] block contents to be YAML", () => {
    const raw = [
      "> [!claros] Freeform",
      "> not: yaml: really",
      "> just prose and symbols ???",
    ].join("\n");

    const blocks = extractClarosBlocks("notes/session.md", raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe("Freeform");
  });
});

describe("scanProjectFormat", () => {
  it("parses root claros.yaml and preserves unknown keys", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(
      root,
      "claros.yaml",
      ["claros: 1", "title: Test Project", "custom_flag: true", "modules:", "  osr: enabled"].join(
        "\n"
      )
    );
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.manifest).toEqual({
      claros: 1,
      title: "Test Project",
      custom_flag: true,
      modules: { osr: "enabled" },
    });
  });

  it("rejects direct manuscript/foo.md", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/foo.md", "# Invalid\n");

    await expect(scanProjectFormat(root, new NodeProjectFileReader())).rejects.toThrow(
      /Direct markdown files under manuscript\//
    );
  });

  it("parses ordered chapters and scenes from sequence-prefixed paths", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/10-finale/02-aftermath.md", "# Aftermath\n");
    await writeProjectFile(root, "manuscript/02-beginning/03-road.md", "# Road\n");
    await writeProjectFile(root, "manuscript/02-beginning/01-start.md", "# Start\n");

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.chapters.map((chapter) => chapter.id)).toEqual(["02-beginning", "10-finale"]);
    expect(snapshot.scenes.map((scene) => scene.path)).toEqual([
      "manuscript/02-beginning/01-start.md",
      "manuscript/02-beginning/03-road.md",
      "manuscript/10-finale/02-aftermath.md",
    ]);
  });

  it("rejects chapter or scene paths without numeric prefixes", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/prologue/01-opening.md", "# Opening\n");

    await expect(scanProjectFormat(root, new NodeProjectFileReader())).rejects.toThrow(
      /Chapter folders must match <sequence>-<kebab-slug>/
    );

    const rootWithBadScene = await createProjectRoot();
    await writeProjectFile(rootWithBadScene, "claros.yaml", "title: Test\n");
    await writeProjectFile(rootWithBadScene, "manuscript/01-prologue/opening.md", "# Opening\n");

    await expect(scanProjectFormat(rootWithBadScene, new NodeProjectFileReader())).rejects.toThrow(
      /Scene files must match <sequence>-<kebab-slug>\.md/
    );
  });

  it("parses optional chapter.yaml title", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(
      root,
      "manuscript/01-prologue/chapter.yaml",
      "title: Prologue\ncustom: true\n"
    );
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.chapters[0]).toMatchObject({
      kind: "chapter",
      id: "01-prologue",
      title: "Prologue",
      metadata: { title: "Prologue", custom: true },
    });
  });

  it('uses "Chapter <sequence>" default when chapter.yaml is absent', async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.chapters[0].title).toBe("Chapter 1");
  });

  it("parses scene frontmatter without treating it as identity", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(
      root,
      "manuscript/01-prologue/01-opening.md",
      [
        "---",
        "title: Opening Scene",
        "id: do-not-use",
        "sequence: 99",
        "chapterId: wrong-chapter",
        "---",
        "",
        "# Opening",
      ].join("\n")
    );

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.scenes[0]).toMatchObject({
      kind: "scene",
      id: "01-prologue/01-opening",
      chapterId: "01-prologue",
      sequence: 1,
      slug: "opening",
      title: "Opening Scene",
    });
    expect(snapshot.scenes[0].frontmatter).toMatchObject({
      id: "do-not-use",
      sequence: 99,
      chapterId: "wrong-chapter",
    });
  });

  it("parses notes recursively under notes/", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");
    await writeProjectFile(root, "notes/characters/kareth.md", "# Kareth\n");
    await writeProjectFile(root, "notes/places/north-gate.md", "# North Gate\n");

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.notes.map((note) => note.path)).toEqual([
      "notes/characters/kareth.md",
      "notes/places/north-gate.md",
    ]);
    expect(snapshot.notes.map((note) => note.slug)).toEqual(["kareth", "north-gate"]);
  });

  it("normalizes note aliases and tags to arrays", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");
    await writeProjectFile(
      root,
      "notes/characters/kareth.md",
      ["---", "aliases: the northern mercenary", "tags: paladin", "---", "", "# Kareth"].join("\n")
    );

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.notes[0].aliases).toEqual(["the northern mercenary"]);
    expect(snapshot.notes[0].tags).toEqual(["paladin"]);
  });

  it("preserves unknown note frontmatter keys", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");
    await writeProjectFile(
      root,
      "notes/characters/kareth.md",
      ["---", "custom_flag: true", "relationship:", "  ally: mira", "---", "", "# Kareth"].join(
        "\n"
      )
    );

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.notes[0].frontmatter).toMatchObject({
      custom_flag: true,
      relationship: { ally: "mira" },
    });
  });

  it("preserves top-level module namespace keys", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");
    await writeProjectFile(
      root,
      "notes/characters/kareth.md",
      [
        "---",
        "osr:",
        "  hp:",
        "    current: 12",
        "    max: 15",
        "mythic:",
        "  status: active",
        "---",
        "",
        "# Kareth",
      ].join("\n")
    );

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.notes[0].frontmatter).toMatchObject({
      osr: { hp: { current: 12, max: 15 } },
      mythic: { status: "active" },
    });
  });

  it("treats frontmatter.state as ordinary metadata only", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");
    await writeProjectFile(
      root,
      "notes/characters/kareth.md",
      ["---", "state:", "  hp: 12", "---", "", "# Kareth"].join("\n")
    );

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.notes[0].frontmatter).toEqual({ state: { hp: 12 } });
  });

  it("collects wikilinks and [!claros] blocks across scanned markdown files", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(root, "claros.yaml", "title: Test\n");
    await writeProjectFile(
      root,
      "manuscript/01-prologue/01-opening.md",
      [
        "See [[Ancient Ruin|the ruin]].",
        "> [!claros] Oracle Check",
        "> plain text is fine",
        "> [claros-run: run_42]",
      ].join("\n")
    );
    await writeProjectFile(root, "notes/characters/kareth.md", "Knows [[Ancient Ruin]].\n");

    const snapshot = await scanProjectFormat(root, new NodeProjectFileReader());

    expect(snapshot.wikilinks).toHaveLength(2);
    expect(snapshot.clarosBlocks).toHaveLength(1);
    expect(snapshot.clarosBlocks[0]).toMatchObject({
      title: "Oracle Check",
      runId: "run_42",
      fromPath: "manuscript/01-prologue/01-opening.md",
    });
  });

  it("rejects alternate core folder paths from claros.yaml", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(
      root,
      "claros.yaml",
      ["title: Test", "paths:", "  manuscript: story"].join("\n")
    );
    await writeProjectFile(root, "manuscript/01-prologue/01-opening.md", "# Opening\n");

    await expect(scanProjectFormat(root, new NodeProjectFileReader())).rejects.toThrow(
      /Alternate core folder paths are not supported for MVP/
    );
  });
});
