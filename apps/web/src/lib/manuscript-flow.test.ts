import { describe, expect, it } from "vitest";

import {
  buildManuscriptChapterFlow,
  type BuildManuscriptChapterFlowOptions,
} from "./manuscript-flow";
import type { WorkspaceChapter, WorkspaceDocument, WorkspaceScene } from "./project-session";

describe("buildManuscriptChapterFlow", () => {
  it("returns current and following scenes for the first scene in a chapter", async () => {
    const flow = await buildFlow("manuscript/001-start/001-opening.md");

    expect(flow?.previousScenes).toEqual([]);
    expect(flow?.currentScene.scene.path).toBe("manuscript/001-start/001-opening.md");
    expect(flow?.currentScene.markdown).toBe("Active draft.");
    expect(flow?.followingScenes.map((block) => block.scene.path)).toEqual([
      "manuscript/001-start/002-middle.md",
      "manuscript/001-start/003-ending.md",
    ]);
  });

  it("splits same-chapter scenes before and after a middle scene", async () => {
    const flow = await buildFlow("manuscript/001-start/002-middle.md");

    expect(flow?.previousScenes.map((block) => block.scene.path)).toEqual([
      "manuscript/001-start/001-opening.md",
    ]);
    expect(flow?.currentScene.scene.path).toBe("manuscript/001-start/002-middle.md");
    expect(flow?.followingScenes.map((block) => block.scene.path)).toEqual([
      "manuscript/001-start/003-ending.md",
    ]);
  });

  it("returns current and previous scenes for the last scene in a chapter", async () => {
    const flow = await buildFlow("manuscript/001-start/003-ending.md");

    expect(flow?.previousScenes.map((block) => block.scene.path)).toEqual([
      "manuscript/001-start/001-opening.md",
      "manuscript/001-start/002-middle.md",
    ]);
    expect(flow?.currentScene.scene.path).toBe("manuscript/001-start/003-ending.md");
    expect(flow?.followingScenes).toEqual([]);
  });

  it("returns only the current scene for a single-scene chapter", async () => {
    const flow = await buildFlow("manuscript/002-alone/001-solo.md");

    expect(flow?.chapter.title).toBe("Alone");
    expect(flow?.previousScenes).toEqual([]);
    expect(flow?.currentScene.scene.path).toBe("manuscript/002-alone/001-solo.md");
    expect(flow?.followingScenes).toEqual([]);
  });

  it("excludes scenes from other chapters completely", async () => {
    const flow = await buildFlow("manuscript/001-start/002-middle.md");
    const paths = [
      ...flow!.previousScenes,
      flow!.currentScene,
      ...flow!.followingScenes,
    ].map((block) => block.scene.path);

    expect(paths).not.toContain("manuscript/002-alone/001-solo.md");
  });

  it("returns undefined for note-active paths", async () => {
    await expect(buildFlow("notes/characters/kareth.md")).resolves.toBeUndefined();
  });

  it("does not background-read the active scene body", async () => {
    const readPaths: string[] = [];
    await buildFlow("manuscript/001-start/002-middle.md", {
      readDocument: async (ref) => {
        readPaths.push(ref.path);
        return document(ref.path);
      },
    });

    expect(readPaths).toEqual([
      "manuscript/001-start/001-opening.md",
      "manuscript/001-start/003-ending.md",
    ]);
  });
});

async function buildFlow(
  activePath: string,
  overrides: Partial<BuildManuscriptChapterFlowOptions> = {}
) {
  return buildManuscriptChapterFlow({
    chapters,
    scenes,
    activePath,
    activeMarkdown: "Active draft.",
    readDocument: async (ref) => document(ref.path),
    ...overrides,
  });
}

function document(path: string): WorkspaceDocument {
  return {
    path,
    raw: `---\ntitle: ${path}\n---\n\nBody for ${path}.`,
    body: `Body for ${path}.`,
    title: path,
    kind: path.startsWith("notes/") ? "note" : "scene",
  };
}

const opening: WorkspaceScene = {
  kind: "scene",
  id: "001-opening",
  chapterId: "001-start",
  sequence: 1,
  title: "Opening",
  path: "manuscript/001-start/001-opening.md",
};

const middle: WorkspaceScene = {
  kind: "scene",
  id: "002-middle",
  chapterId: "001-start",
  sequence: 2,
  title: "Middle",
  path: "manuscript/001-start/002-middle.md",
};

const ending: WorkspaceScene = {
  kind: "scene",
  id: "003-ending",
  chapterId: "001-start",
  sequence: 3,
  title: "Ending",
  path: "manuscript/001-start/003-ending.md",
};

const solo: WorkspaceScene = {
  kind: "scene",
  id: "001-solo",
  chapterId: "002-alone",
  sequence: 1,
  title: "Solo",
  path: "manuscript/002-alone/001-solo.md",
};

const scenes: WorkspaceScene[] = [opening, middle, ending, solo];

const chapters: WorkspaceChapter[] = [
  {
    kind: "chapter",
    id: "001-start",
    sequence: 1,
    title: "Start",
    scenes: [opening, middle, ending],
  },
  {
    kind: "chapter",
    id: "002-alone",
    sequence: 2,
    title: "Alone",
    scenes: [solo],
  },
];
