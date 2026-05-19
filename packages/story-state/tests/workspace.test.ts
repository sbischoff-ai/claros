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

class SpyProjectFileWriter extends NodeProjectFileWriter {
  readonly writes: string[] = [];

  override async writeFileAtomic(filePath: string, content: string): Promise<void> {
    this.writes.push(filePath);
    await super.writeFileAtomic(filePath, content);
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
    "manuscript/01-prologue/01-opening.md",
    ["---", "title: Opening", "---", "", "Start at [[Ancient Ruin]].", "", "Opening body."].join(
      "\n"
    )
  );
  await writeProjectFile(
    root,
    "manuscript/01-prologue/02-arrival.md",
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
    "state/scenes/01-prologue/01-opening.yaml",
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
    expect(project.listChapters().map((chapter) => chapter.id)).toEqual(["01-prologue"]);
    expect(project.listScenes().map((scene) => scene.path)).toEqual([
      "manuscript/01-prologue/01-opening.md",
      "manuscript/01-prologue/02-arrival.md",
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

    const opening = await project.readDocument({ path: "manuscript/01-prologue/01-opening.md" });
    expect(opening.frontmatter).toEqual({ title: "Opening" });

    const nextOpening = opening.raw.replace("Opening body.", "Updated opening body.");
    await project.writeDocument({ path: opening.path }, nextOpening);

    const kareth = await project.readDocument({ path: "notes/characters/kareth.md" });
    await project.writeDocument(
      { path: kareth.path },
      kareth.raw.replace("Body text.", "Updated note body.")
    );

    expect(await fs.readFile(path.join(root, opening.path), "utf8")).toContain(
      "Updated opening body."
    );
    expect(await fs.readFile(path.join(root, kareth.path), "utf8")).toContain("Updated note body.");
    expect(writer.writes).toContain(path.join(root, opening.path));
    expect(writer.writes).toContain(path.join(root, kareth.path));
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

    await project.setNoteFrontmatterPath("notes/characters/kareth.md", "osr.hp.current", 10);

    const after = await fs.readFile(notePath, "utf8");
    expect(after.endsWith(originalBody)).toBe(true);
    expect(
      await project.getNoteFrontmatterPath("notes/characters/kareth.md", "osr.hp.current")
    ).toBe(10);
    expect(writer.writes).toContain(notePath);
  });

  it("reads and writes state paths, including digit-prefixed filenames", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    await project.setSceneState("01-prologue/01-opening", "mythic.chaos_factor", 6);
    expect(await project.getSceneState("01-prologue/01-opening", "mythic.chaos_factor")).toBe(6);

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
    ).toEqual(["manuscript/01-prologue/01-opening.md:Ancient Ruin"]);

    expect(project.listClarosBlocks().map((block) => block.runId)).toEqual(["00009"]);
    expect(project.listClarosBlocks({ path: "notes/places/ancient-ruin.md" })).toHaveLength(1);
  });

  it("executes a macro in scene context, inserts a block, and appends a run ledger entry", async () => {
    const root = await createProjectRoot();
    const project = await openProject(root);

    expect(await project.listMacroRuns()).toEqual([]);

    const result = await project.executeMacroInDocument({
      document: { path: "manuscript/01-prologue/01-opening.md" },
      macroId: "mythic.scene-setup",
      params: { pcs_in_control: true },
      insertAt: { kind: "end-of-document" },
    });

    expect(result.run.macro).toBe("mythic.scene-setup");
    expect(result.run.document).toBe("manuscript/01-prologue/01-opening.md");
    expect(result.run.sceneId).toBe("01-prologue/01-opening");
    expect(result.run.chapterId).toBe("01-prologue");
    expect(result.document?.raw).toContain("[!claros] Mythi");
    expect(await project.getSceneState("01-prologue/01-opening", "mythic.chaos_factor")).toBe(4);

    const runs = await project.listMacroRuns();
    expect(runs).toHaveLength(1);
    expect(await project.getMacroRun(result.run.id)).toMatchObject({ id: result.run.id });
    expect(project.listClarosBlocks({ path: "manuscript/01-prologue/01-opening.md" })).toHaveLength(
      1
    );
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
