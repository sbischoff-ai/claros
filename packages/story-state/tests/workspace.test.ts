import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStateFile } from "@claros/story-format";
import {
  CheckpointNotImplementedError,
  NodeProjectFileReader,
  NodeProjectFileWriter,
  getNoteFrontmatterPath,
  getSceneState,
  openProject,
  setSceneState,
  type ClarosProject,
  type LinkResolution,
} from "../src/index.js";

const MODULE_DIR = fileURLToPath(new URL("../../../examples/mythic-gme-2e/", import.meta.url));
const tempDirs: string[] = [];

class SpyProjectFileReader extends NodeProjectFileReader {
  readonly reads: string[] = [];

  override async readFile(filePath: string): Promise<string> {
    this.reads.push(filePath);
    return super.readFile(filePath);
  }
}

class SpyProjectFileWriter extends NodeProjectFileWriter {
  readonly writes: string[] = [];
  readonly renames: Array<{ fromPath: string; toPath: string }> = [];

  override async writeFileAtomic(filePath: string, content: string): Promise<void> {
    this.writes.push(filePath);
    await super.writeFileAtomic(filePath, content);
  }

  override async renameFile(fromPath: string, toPath: string): Promise<void> {
    this.renames.push({ fromPath, toPath });
    await super.renameFile(fromPath, toPath);
  }
}

class FailingProjectFileWriter extends NodeProjectFileWriter {
  override async writeFileAtomic(_filePath: string, _content: string): Promise<void> {
    throw new Error("intentional write failure");
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claros-iter12-"));
  tempDirs.push(root);

  await writeProjectFile(
    root,
    "claros.yaml",
    ["claros: 1", "title: Workspace Test", "modules:", "  - mythic-gme-2e"].join("\n")
  );

  await writeProjectFile(
    root,
    "manuscript/001-prologue/001-opening.md",
    ["---", "title: Opening", "---", "", "Start at [[Ancient Ruin]].", "", "Opening body."].join(
      "\n"
    )
  );
  await writeProjectFile(
    root,
    "manuscript/001-prologue/002-arrival.md",
    ["---", "title: Arrival", "---", "", "See [[kareth]]."].join("\n")
  );
  await writeProjectFile(
    root,
    "notes/characters/kareth.md",
    [
      "---",
      "title: Kareth",
      "mythic:",
      "  status: active",
      "osr:",
      "  hp:",
      "    current: 12",
      "---",
      "",
      "# Kareth",
      "",
      "Body text.",
    ].join("\n")
  );
  await writeProjectFile(
    root,
    "notes/places/ancient-ruin.md",
    [
      "---",
      "title: Ancient Ruin",
      "aliases:",
      "  - old temple",
      "tags:",
      "  - lore",
      "---",
      "",
      "> [!claros] Existing Oracle",
      "> Result: yes",
      "> [claros-run: 00009]",
      "",
      "Ancient note body.",
    ].join("\n")
  );

  await writeProjectFile(
    root,
    "state/scenes/001-prologue/001-opening.yaml",
    "mythic:\n  chaos_factor: 5\n"
  );

  await fs.cp(MODULE_DIR, path.join(root, "modules", "mythic-gme-2e"), { recursive: true });

  return root;
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

describe("openProject", () => {
  it("opens a sample project and lists semantic sidebar data", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    expect(project.manifest.title).toBe("Workspace Test");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual(["001-prologue"]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-prologue/001-opening.md",
      "manuscript/001-prologue/002-arrival.md",
    ]);
    expect(project.listNotes().map((note) => note.path)).toEqual([
      "notes/characters/kareth.md",
      "notes/places/ancient-ruin.md",
    ]);
  });

  it("reads and writes scene and note markdown documents through the workspace API", async () => {
    const root = await createProjectRoot();
    const writer = new SpyProjectFileWriter();
    const project = await openProject(root, {
      fileReader: new NodeProjectFileReader(),
      fileWriter: writer,
    });

    const opening = await project.readDocument({ path: "manuscript/001-prologue/001-opening.md" });
    expect(opening.frontmatter).toEqual({ title: "Opening" });

    const nextOpening = opening.raw.replace("Opening body.", "Updated opening body.");
    const openingResult = await project.writeDocument({ path: opening.path }, nextOpening);

    const kareth = await project.readDocument({ path: "notes/characters/kareth.md" });
    const noteResult = await project.writeDocument(
      { path: kareth.path },
      kareth.raw.replace("Body text.", "Updated note body.")
    );

    expect(await fs.readFile(path.join(root, opening.path), "utf8")).toContain(
      "Updated opening body."
    );
    expect(await fs.readFile(path.join(root, kareth.path), "utf8")).toContain("Updated note body.");
    expect(writer.writes).toContain(path.join(root, opening.path));
    expect(writer.writes).toContain(path.join(root, kareth.path));
    expect(openingResult).toEqual({
      kind: "document-write",
      changedPaths: [opening.path],
      indexUpdated: true,
    });
    expect(noteResult).toEqual({
      kind: "document-write",
      changedPaths: [kareth.path],
      indexUpdated: true,
    });
    expect(await fs.readFile(path.join(root, opening.path), "utf8")).toContain("[[Ancient Ruin]]");
  });

  it("does not update the in-memory index when a document write fails", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root, {
      fileReader: new NodeProjectFileReader(),
      fileWriter: new FailingProjectFileWriter(),
    });

    const opening = await project.readDocument({ path: "manuscript/001-prologue/001-opening.md" });
    await expect(
      project.writeDocument({ path: opening.path }, opening.raw.replace("Opening", "Changed"))
    ).rejects.toThrow("intentional write failure");

    expect(project.listScenes().find((scene) => scene.path === opening.path)?.title).toBe(
      "Opening"
    );
  });

  it("preserves markdown body bytes for frontmatter-only note mutations and wraps explicit-root helpers", async () => {
    const root = await createProjectRoot();
    const writer = new SpyProjectFileWriter();
    const project = await openProject(root, {
      fileReader: new NodeProjectFileReader(),
      fileWriter: writer,
    });

    const notePath = path.join(root, "notes/characters/kareth.md");
    const before = await fs.readFile(notePath, "utf8");
    const originalBody = before.slice(before.indexOf("# Kareth") - 1);

    expect(await getNoteFrontmatterPath("notes/characters/kareth.md", root, "mythic.status")).toBe(
      "active"
    );
    expect(
      await project.getNoteFrontmatterPath("notes/characters/kareth.md", "mythic.status")
    ).toBe("active");

    const result = await project.setNoteFrontmatterPath(
      "notes/characters/kareth.md",
      "osr.hp.current",
      10
    );
    await project.setNoteFrontmatterPath("notes/characters/kareth.md", "state.visible", true);

    const after = await fs.readFile(notePath, "utf8");
    expect(after.endsWith(originalBody)).toBe(true);
    expect(
      await project.getNoteFrontmatterPath("notes/characters/kareth.md", "osr.hp.current")
    ).toBe(10);
    expect(
      await project.getNoteFrontmatterPath("notes/characters/kareth.md", "state.visible")
    ).toBe(true);
    expect(writer.writes).toContain(notePath);
    expect(result).toEqual({
      kind: "frontmatter-path",
      changedPaths: ["notes/characters/kareth.md"],
      indexUpdated: true,
    });
  });

  it("reads and writes state paths, including digit-prefixed filenames", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    const writer = new SpyProjectFileWriter();
    const projectWithWriter = await openProject(root, {
      fileReader: new NodeProjectFileReader(),
      fileWriter: writer,
    });

    const result = await projectWithWriter.setSceneState(
      "001-prologue/001-opening",
      "mythic.chaos_factor",
      6
    );
    expect(await project.getSceneState("001-prologue/001-opening", "mythic.chaos_factor")).toBe(6);

    await setSceneState(root, "2-into-the-dark", "mythic.chaos_factor", 4);
    expect(await getSceneState(root, "2-into-the-dark", "mythic.chaos_factor")).toBe(4);

    await project.setChapterState("1-the-abandoned-temple", "route.current", "north");

    expect(
      parseStateFile(
        await fs.readFile(path.join(root, "state/scenes/2-into-the-dark.yaml"), "utf8")
      ).data
    ).toEqual({ mythic: { chaos_factor: 4 } });
    expect(
      parseStateFile(
        await fs.readFile(path.join(root, "state/chapters/1-the-abandoned-temple.yaml"), "utf8")
      ).data
    ).toEqual({ route: { current: "north" } });
    expect(writer.writes).toContain(path.join(root, "state/scenes/001-prologue/001-opening.yaml"));
    expect(result).toEqual({
      kind: "state-path",
      changedPaths: ["state/scenes/001-prologue/001-opening.yaml"],
      indexUpdated: false,
    });
  });

  it("mutates project and chapter metadata while preserving unknown keys semantically", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(
      root,
      "manuscript/001-prologue/chapter.yaml",
      ["title: Prologue", "unknown:", "  keep: true"].join("\n")
    );
    const project = await openProject(root);

    await project.setProjectMetadataPath("exports.clean", true);
    await project.setChapterMetadataPath("001-prologue", "route.current", "north");

    expect(
      parseStateFile(await fs.readFile(path.join(root, "claros.yaml"), "utf8")).data
    ).toMatchObject({
      title: "Workspace Test",
      exports: { clean: true },
    });
    expect(
      parseStateFile(
        await fs.readFile(path.join(root, "manuscript/001-prologue/chapter.yaml"), "utf8")
      ).data
    ).toEqual({
      title: "Prologue",
      unknown: { keep: true },
      route: { current: "north" },
    });
  });

  it("appends and titles manuscript chapters and scenes", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    await project.setProjectTitle("Next Workspace");
    const appendedChapter = await project.appendChapter("Second Act");
    const appendedScene = await project.appendScene("");
    await project.setChapterTitle("001-prologue", "");
    await project.setSceneTitle("manuscript/001-chapter-1/001-opening.md", "A New Opening");

    expect(appendedChapter.scene.path).toBe("manuscript/002-second-act/003-scene-3.md");
    expect(appendedScene.scene.path).toBe("manuscript/002-second-act/004-scene-4.md");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-chapter-1",
      "002-second-act",
    ]);
    expect(project.listScenes().map((scene) => scene.path)).toContain(
      "manuscript/001-chapter-1/001-a-new-opening.md"
    );
    expect(project.listChapters().map((chapter) => chapter.title)).toEqual([
      "Chapter 1",
      "Second Act",
    ]);
    expect(project.listScenes().map((scene) => scene.title ?? `Scene ${scene.sequence}`)).toEqual([
      "A New Opening",
      "Arrival",
      "Scene 3",
      "Scene 4",
    ]);
    expect(
      parseStateFile(await fs.readFile(path.join(root, "claros.yaml"), "utf8")).data
    ).toMatchObject({
      title: "Next Workspace",
    });
  });

  it("inserts manuscript chapters and scenes around existing items", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    await project.appendChapter("Finale");
    const insertedScene = await project.createScene("Interlude", {
      placement: "before",
      targetScene: "manuscript/001-prologue/002-arrival.md",
    });
    const insertedChapter = await project.createChapter("Middle Act", "Bridge", {
      placement: "after",
      targetChapter: "001-prologue",
    });

    expect(insertedScene.scene.path).toBe("manuscript/001-prologue/002-interlude.md");
    expect(insertedChapter.scene.path).toBe("manuscript/002-middle-act/004-bridge.md");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-prologue",
      "002-middle-act",
      "003-finale",
    ]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-prologue/001-opening.md",
      "manuscript/001-prologue/002-interlude.md",
      "manuscript/001-prologue/003-arrival.md",
      "manuscript/002-middle-act/004-bridge.md",
      "manuscript/003-finale/005-scene-5.md",
    ]);
    expect(
      await fs.readFile(path.join(root, "manuscript/001-prologue/003-arrival.md"), "utf8")
    ).toContain("See [[kareth]].");
  });

  it("moves manuscript chapters while resequencing their scenes", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);
    await project.appendChapter("Second Act", "Bridge");

    const downMove = await project.moveChapter("001-prologue", {
      placement: "after",
      targetChapter: "002-second-act",
    });
    expect(downMove.chapter.id).toBe("002-prologue");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-second-act",
      "002-prologue",
    ]);

    const move = await project.moveChapter("002-prologue", {
      placement: "before",
      targetChapter: "001-second-act",
    });

    expect(move.chapter.id).toBe("001-prologue");
    expect(move.chapterIdMap).toMatchObject({
      "001-second-act": "002-second-act",
      "002-prologue": "001-prologue",
    });
    expect(move.pathMap["manuscript/001-second-act/001-bridge.md"]).toBe(
      "manuscript/002-second-act/003-bridge.md"
    );
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-prologue",
      "002-second-act",
    ]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-prologue/001-opening.md",
      "manuscript/001-prologue/002-arrival.md",
      "manuscript/002-second-act/003-bridge.md",
    ]);
  });

  it("moves scenes across chapter boundaries and deletes an empty source chapter", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);
    await project.appendChapter("Second Act", "Bridge");

    const downMove = await project.moveScene("manuscript/001-prologue/001-opening.md", {
      placement: "after",
      targetScene: "manuscript/001-prologue/002-arrival.md",
    });
    expect(downMove.scene.path).toBe("manuscript/001-prologue/002-opening.md");

    const move = await project.moveScene("manuscript/002-second-act/003-bridge.md", {
      placement: "before",
      targetScene: "manuscript/001-prologue/001-arrival.md",
    });

    expect(move.scene.path).toBe("manuscript/001-prologue/001-bridge.md");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual(["001-prologue"]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-prologue/001-bridge.md",
      "manuscript/001-prologue/002-arrival.md",
      "manuscript/001-prologue/003-opening.md",
    ]);
    await expect(fs.stat(path.join(root, "manuscript/002-second-act"))).rejects.toThrow();
    expect(
      await fs.readFile(path.join(root, "manuscript/001-prologue/001-bridge.md"), "utf8")
    ).toContain("title: Bridge");
  });

  it("appends the only scene in a chapter to another chapter and deletes the source chapter", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);
    await project.appendChapter("Second Act", "Bridge");

    const move = await project.moveScene("manuscript/002-second-act/003-bridge.md", {
      placement: "append",
      targetChapter: "001-prologue",
    });

    expect(move.scene.path).toBe("manuscript/001-prologue/003-bridge.md");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual(["001-prologue"]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-prologue/001-opening.md",
      "manuscript/001-prologue/002-arrival.md",
      "manuscript/001-prologue/003-bridge.md",
    ]);
  });

  it("renames chapter and scene paths from normalized title slugs", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    await project.appendChapter("Second Act");
    await project.setChapterTitle("002-second-act", "THE GREAT WALRUS!");

    expect(project.listChapters().map((chapter) => chapter.id)).toEqual([
      "001-prologue",
      "002-the-great-walrus",
    ]);
    expect(project.listScenes().map((scene) => scene.path)).toContain(
      "manuscript/002-the-great-walrus/003-scene-3.md"
    );

    for (let sequence = 3; sequence <= 121; sequence += 1) {
      await writeProjectFile(
        root,
        `manuscript/001-prologue/${String(sequence).padStart(3, "0")}-scene-${sequence}.md`,
        `Scene ${sequence}.`
      );
    }
    const reloaded = await openProject(root);

    await reloaded.setSceneTitle("manuscript/001-prologue/121-scene-121.md", "tHe ulTimATUm...");

    expect(reloaded.listScenes().map((scene) => scene.path)).toContain(
      "manuscript/001-prologue/121-the-ultimatum.md"
    );
  });

  it("deletes scenes and chapters while resequencing manuscript paths", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    await project.appendChapter("Second Act");
    const deleteSceneResult = await project.deleteScene("manuscript/001-prologue/001-opening.md");

    expect(deleteSceneResult.nextScene?.path).toBe("manuscript/001-prologue/001-arrival.md");
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-prologue/001-arrival.md",
      "manuscript/002-second-act/002-scene-2.md",
    ]);

    const deleteChapterResult = await project.deleteChapter("001-prologue");
    expect(deleteChapterResult.nextScene?.path).toBe("manuscript/001-second-act/001-scene-1.md");
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual(["001-second-act"]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/001-second-act/001-scene-1.md",
    ]);
    await expect(project.deleteScene("manuscript/001-second-act/001-scene-1.md")).rejects.toThrow(
      "Cannot delete the final remaining scene"
    );
  });

  it("plans note renames without modifying files during dry-run", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    const plan = await project.planRenameNote(
      "notes/characters/kareth.md",
      "notes/characters/kareth-renamed.md",
      { rewriteLinks: true, dryRun: true }
    );
    const result = await project.renameNote(
      "notes/characters/kareth.md",
      "notes/characters/kareth-renamed.md",
      { rewriteLinks: true, dryRun: true }
    );

    expect(plan).toMatchObject({
      operation: "rename-note",
      currentPath: "notes/characters/kareth.md",
      targetPath: "notes/characters/kareth-renamed.md",
      warnings: [],
    });
    expect(plan.affectedPaths).toContain("notes/characters/kareth.md");
    expect(plan.affectedPaths).toContain("notes/characters/kareth-renamed.md");
    expect(plan.linkRewrite?.rewrites.map((rewrite) => rewrite.path)).toEqual([
      "manuscript/001-prologue/002-arrival.md",
    ]);
    expect(result).toEqual({ kind: "structural", changedPaths: [], indexUpdated: false });
    await expect(fs.stat(path.join(root, "notes/characters/kareth.md"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, "notes/characters/kareth-renamed.md"))).rejects.toThrow();
  });

  it("renames notes, rewrites only unambiguous links, and refreshes the index", async () => {
    const root = await createProjectRoot();
    const writer = new SpyProjectFileWriter();
    const project = await openProject(root, {
      fileReader: new NodeProjectFileReader(),
      fileWriter: writer,
    });

    const result = await project.renameNote(
      "notes/characters/kareth.md",
      "notes/characters/kareth-renamed.md",
      { rewriteLinks: true }
    );

    await expect(fs.stat(path.join(root, "notes/characters/kareth.md"))).rejects.toThrow();
    await expect(
      fs.stat(path.join(root, "notes/characters/kareth-renamed.md"))
    ).resolves.toBeDefined();
    expect(
      await fs.readFile(path.join(root, "manuscript/001-prologue/002-arrival.md"), "utf8")
    ).toContain("[[notes/characters/kareth-renamed.md|kareth]]");
    expect(project.listNotes().map((note) => note.path)).toContain(
      "notes/characters/kareth-renamed.md"
    );
    expect(project.resolveWikilink("notes/characters/kareth-renamed.md")).toMatchObject({
      status: "resolved",
      path: "notes/characters/kareth-renamed.md",
    });
    expect(writer.renames).toEqual([
      {
        fromPath: path.join(root, "notes/characters/kareth.md"),
        toPath: path.join(root, "notes/characters/kareth-renamed.md"),
      },
    ]);
    expect(result.kind).toBe("structural");
    expect(result.indexUpdated).toBe(true);
    expect(result.changedPaths).toEqual([
      "manuscript/001-prologue/002-arrival.md",
      "notes/characters/kareth-renamed.md",
      "notes/characters/kareth.md",
    ]);
  });

  it("reports ambiguous duplicate title links instead of guessing during rename planning", async () => {
    const root = await createProjectRoot();
    await writeProjectFile(
      root,
      "notes/other/kareth-double.md",
      ["---", "title: Kareth", "---", "", "Second Kareth."].join("\n")
    );
    const project = await openProject(root);

    const plan = await project.planRenameNote(
      "notes/characters/kareth.md",
      "notes/characters/kareth-renamed.md",
      { rewriteLinks: true }
    );

    expect(plan.linkRewrite?.rewrites).toEqual([]);
    expect(plan.linkRewrite?.ambiguousLinks.map((link) => link.raw)).toContain("[[kareth]]");
  });

  it("resolves wikilinks/backlinks and lists Claros blocks through the in-memory index", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    const resolution: LinkResolution = project.resolveWikilink("old temple");
    expect(resolution).toMatchObject({
      status: "resolved",
      reason: "alias",
      path: "notes/places/ancient-ruin.md",
    });

    expect(
      project
        .getBacklinks({ path: "notes/places/ancient-ruin.md" })
        .map((link) => `${link.fromPath}:${link.target}`)
    ).toEqual(["manuscript/001-prologue/001-opening.md:Ancient Ruin"]);

    expect(project.listClarosBlocks().map((block) => block.runId)).toEqual(["00009"]);
    expect(project.listClarosBlocks({ path: "notes/places/ancient-ruin.md" })).toHaveLength(1);
  });

  it("executes a macro in scene context, inserts a block, and appends a run ledger entry", async () => {
    const root = await createProjectRoot();
    const reader = new SpyProjectFileReader();
    const writer = new SpyProjectFileWriter();
    const project = await openProject(root, {
      fileReader: reader,
      fileWriter: writer,
    });

    expect(await project.listMacroRuns()).toEqual([]);

    const result = await project.executeMacroInDocument({
      document: { path: "manuscript/001-prologue/001-opening.md" },
      macroId: "mythic.scene-setup",
      params: { pcs_in_control: true },
      insertAt: { kind: "end-of-document" },
    });

    expect(result.run.macro).toBe("mythic.scene-setup");
    expect(result.run.document).toBe("manuscript/001-prologue/001-opening.md");
    expect(result.run.sceneId).toBe("001-prologue/001-opening");
    expect(result.run.chapterId).toBe("001-prologue");
    expect(result.document?.raw).toContain("[!claros] Mythi");
    expect(await project.getSceneState("001-prologue/001-opening", "mythic.chaos_factor")).toBe(4);

    const runs = await project.listMacroRuns();
    expect(runs).toHaveLength(1);
    expect(await project.getMacroRun(result.run.id)).toMatchObject({ id: result.run.id });
    expect(
      project.listClarosBlocks({ path: "manuscript/001-prologue/001-opening.md" })
    ).toHaveLength(1);
    expect(reader.reads).toContain(path.join(root, "manuscript/001-prologue/001-opening.md"));
    expect(writer.writes).toContain(path.join(root, "manuscript/001-prologue/001-opening.md"));
  });

  it("exposes checkpoint status/history shape while leaving git checkpoint internals for later", async () => {
    const root = await createProjectRoot();
    const project: ClarosProject = await openProject(root);

    await expect(project.checkpoint("manual save")).rejects.toThrow(CheckpointNotImplementedError);
    await expect(project.restoreCheckpoint("abc")).rejects.toThrow(CheckpointNotImplementedError);
    await expect(project.getCheckpointStatus()).resolves.toEqual({
      dirty: false,
      changedPaths: [],
      currentTimeline: "working",
    });
    await expect(project.listCheckpoints()).resolves.toEqual([]);
  });
});
