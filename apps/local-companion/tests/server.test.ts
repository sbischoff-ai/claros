import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createLocalCompanionServer, type LocalCompanionServer } from "../src/server.js";

const tempDirs: string[] = [];
const servers: LocalCompanionServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("local companion server", () => {
  it("serves project summary and documents with token auth", async () => {
    const root = await createProjectRoot();
    const { baseUrl, token } = await start(root);

    const unauthorized = await fetch(`${baseUrl}/api/project`);
    expect(unauthorized.status).toBe(401);

    const project = (await fetchJson(baseUrl, token, "/api/project")) as ProjectResponse;
    expect(project.project.manifest.title).toBe("Companion Workspace");
    expect(project.project.chapters[0].scenes[0].path).toBe("manuscript/001-start/001-opening.md");

    const document = (await fetchJson(
      baseUrl,
      token,
      "/api/document?path=manuscript/001-start/001-opening.md"
    )) as DocumentResponse;
    expect(document.document.body).toBe("\nStart.");
  });

  it("writes document bodies while preserving frontmatter", async () => {
    const root = await createProjectRoot();
    const { baseUrl, token } = await start(root);

    const response = await fetch(`${baseUrl}/api/document`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: "notes/characters/kareth.md",
        body: "# Kareth\n\nUpdated.",
      }),
    });

    expect(response.status).toBe(200);
    const written = await fs.readFile(path.join(root, "notes/characters/kareth.md"), "utf8");
    expect(written).toContain("---\ntitle: Kareth");
    expect(written).toContain("tags:\n  - character");
    expect(written).toContain("# Kareth\n\nUpdated.");
  });

  it("rejects disallowed origins and unknown document paths", async () => {
    const root = await createProjectRoot();
    const { baseUrl, token } = await start(root, ["http://allowed.example"]);

    const forbidden = await fetch(`${baseUrl}/api/project`, {
      headers: {
        authorization: `Bearer ${token}`,
        origin: "http://evil.example",
      },
    });
    expect(forbidden.status).toBe(403);

    const unknown = await fetch(`${baseUrl}/api/document?path=../../outside.md`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unknown.status).toBe(400);
  });

  it("initializes a new project in an empty folder", async () => {
    const root = await makeTempDir();
    const { baseUrl, token } = await start(root);

    const response = await fetch(`${baseUrl}/api/project/new`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(201);
    expect(await fs.readFile(path.join(root, "claros.yaml"), "utf8")).toContain("Untitled Project");
    expect(
      await fs.readFile(path.join(root, "manuscript/001-draft/001-opening.md"), "utf8")
    ).toContain("## Opening");
  });

  it("mutates project titles and manuscript structure", async () => {
    const root = await createProjectRoot();
    const { baseUrl, token } = await start(root);

    const renamed = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "set-project-title",
      title: "Renamed Companion",
    })) as ProjectResponse;
    expect(renamed.project.manifest.title).toBe("Renamed Companion");

    const chapter = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "append-chapter",
      title: "Second Act",
    })) as MutationResponse;
    expect(chapter.scene?.path).toBe("manuscript/002-second-act/002-scene-2.md");

    const retitledChapter = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "set-chapter-title",
      chapterId: "002-second-act",
      title: "THE GREAT WALRUS!",
    })) as MutationResponse;
    expect(retitledChapter.chapter?.id).toBe("002-the-great-walrus");

    const retitledScene = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "set-scene-title",
      path: "manuscript/002-the-great-walrus/002-scene-2.md",
      title: "tHe ulTimATUm...",
    })) as MutationResponse;
    expect(retitledScene.scene?.path).toBe("manuscript/002-the-great-walrus/002-the-ultimatum.md");

    const insertedChapter = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "create-chapter",
      title: "Middle Act",
      sceneTitle: "Bridge",
      placement: "before",
      targetChapterId: "002-the-great-walrus",
    })) as MutationResponse;
    expect(insertedChapter.scene?.path).toBe("manuscript/002-middle-act/002-bridge.md");

    const insertedScene = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "create-scene",
      title: "Interlude",
      placement: "after",
      targetScenePath: "manuscript/001-start/001-opening.md",
    })) as MutationResponse;
    expect(insertedScene.scene?.path).toBe("manuscript/001-start/002-interlude.md");

    const deleted = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "delete-scene",
      path: "manuscript/001-start/001-opening.md",
    })) as MutationResponse;
    expect(deleted.nextPath).toBe("manuscript/001-start/001-interlude.md");
    expect(deleted.project.chapters.map((entry) => entry.scenes[0].path)).toEqual([
      "manuscript/001-start/001-interlude.md",
      "manuscript/002-middle-act/002-bridge.md",
      "manuscript/003-the-great-walrus/003-the-ultimatum.md",
    ]);

    const movedChapter = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "move-chapter",
      chapterId: "003-the-great-walrus",
      placement: "before",
      targetChapterId: "001-start",
    })) as MutationResponse;
    expect(movedChapter.chapter?.id).toBe("001-the-great-walrus");
    expect(movedChapter.chapterIdMap?.["003-the-great-walrus"]).toBe("001-the-great-walrus");

    const movedScene = (await postJson(baseUrl, token, "/api/project/mutation", {
      action: "move-scene",
      path: "manuscript/001-the-great-walrus/001-the-ultimatum.md",
      placement: "after",
      targetScenePath: "manuscript/003-middle-act/003-bridge.md",
    })) as MutationResponse;
    expect(movedScene.scene?.path).toBe("manuscript/002-middle-act/003-the-ultimatum.md");
    expect(movedScene.pathMap?.["manuscript/001-the-great-walrus/001-the-ultimatum.md"]).toBe(
      "manuscript/002-middle-act/003-the-ultimatum.md"
    );
    expect(movedScene.project.chapters.map((entry) => entry.id)).toEqual([
      "001-start",
      "002-middle-act",
    ]);
  });
});

async function start(
  root: string,
  allowedOrigins = ["http://127.0.0.1:5173"]
): Promise<{ baseUrl: string; token: string }> {
  const companion = createLocalCompanionServer({
    projectRoot: root,
    token: "test-token",
    allowedOrigins,
  });
  servers.push(companion);
  const address = await companion.listen(0);
  return {
    baseUrl: `http://${address.host}:${address.port}`,
    token: companion.token,
  };
}

async function fetchJson(baseUrl: string, token: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function postJson(
  baseUrl: string,
  token: string,
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return response.json();
}

interface ProjectResponse {
  project: {
    manifest: { title: string };
    chapters: Array<{ scenes: Array<{ path: string }> }>;
  };
}

interface MutationResponse extends ProjectResponse {
  chapter?: { id: string };
  scene?: { path: string };
  nextPath?: string;
  pathMap?: Record<string, string>;
  chapterIdMap?: Record<string, string>;
}

interface DocumentResponse {
  document: {
    body: string;
  };
}

async function createProjectRoot(): Promise<string> {
  const root = await makeTempDir();
  await writeProjectFile(root, "claros.yaml", "claros: 1\ntitle: Companion Workspace\n");
  await writeProjectFile(root, "manuscript/001-start/chapter.yaml", "title: Start\n");
  await writeProjectFile(
    root,
    "manuscript/001-start/001-opening.md",
    "---\ntitle: Opening\n---\n\nStart."
  );
  await writeProjectFile(
    root,
    "notes/characters/kareth.md",
    "---\ntitle: Kareth\ntags:\n  - character\n---\n# Kareth\n\nA cautious mercenary."
  );
  return root;
}

async function makeTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claros-local-companion-"));
  tempDirs.push(root);
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
