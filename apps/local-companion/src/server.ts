import { randomBytes } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import * as path from "node:path";
import {
  openProject,
  type ChapterRef,
  type ClarosProject,
  type MarkdownDocument,
  type NoteRef,
  type ProjectManifest,
  type SceneRef,
} from "@claros/story-state";

export interface LocalCompanionOptions {
  projectRoot: string;
  token?: string;
  allowedOrigins?: string[];
}

export interface LocalCompanionServer {
  readonly server: Server;
  readonly token: string;
  listen(port: number, host?: string): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
}

export interface ProjectSummary {
  manifest: WorkspaceManifest;
  chapters: WorkspaceChapter[];
  notes: WorkspaceNote[];
}

interface WorkspaceManifest {
  title: string;
}

interface WorkspaceChapter {
  kind: "chapter";
  id: string;
  sequence: number;
  title: string;
  scenes: WorkspaceScene[];
}

interface WorkspaceScene {
  kind: "scene";
  id: string;
  chapterId: string;
  sequence: number;
  title: string;
  path: string;
}

interface WorkspaceNote {
  kind: "note";
  id: string;
  path: string;
  title: string;
  folderPath: string[];
}

interface WorkspaceDocument {
  path: string;
  raw: string;
  body: string;
  title: string;
  kind: "scene" | "note";
}

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://localhost:5173",
  "http://localhost:5174",
];

export function createLocalCompanionServer(options: LocalCompanionOptions): LocalCompanionServer {
  const token = options.token ?? randomBytes(24).toString("base64url");
  const allowedOrigins = new Set(options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS);
  const projectRoot = path.resolve(options.projectRoot);
  let project: ClarosProject | undefined;

  const server = createServer(async (request, response) => {
    try {
      if (!handleCors(request, response, allowedOrigins)) {
        return;
      }
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/api/health" && !isAuthorized(request, token)) {
        writeJson(response, 401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Invalid token" },
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        writeJson(response, 200, {
          ok: true,
          projectLabel: path.basename(projectRoot) || "project",
          projectOpen: await hasProject(projectRoot),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/project") {
        project = await openProject(projectRoot);
        writeJson(response, 200, { ok: true, project: summarizeProject(project) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/document") {
        const current = await ensureProject();
        const documentPath = url.searchParams.get("path") ?? "";
        ensureKnownDocumentPath(current, documentPath);
        writeJson(response, 200, {
          ok: true,
          document: toWorkspaceDocument(
            current,
            await current.readDocument({ path: documentPath })
          ),
        });
        return;
      }

      if (request.method === "PUT" && url.pathname === "/api/document") {
        const current = await ensureProject();
        const body = await readJsonBody(request);
        if (!isRecord(body) || typeof body.path !== "string" || typeof body.body !== "string") {
          writeJson(response, 400, {
            ok: false,
            error: { code: "BAD_REQUEST", message: "Expected JSON body with path and body" },
          });
          return;
        }
        ensureKnownDocumentPath(current, body.path);
        const before = await current.readDocument({ path: body.path });
        await current.writeDocument(
          { path: body.path },
          mergeBodyWithExistingFrontmatter(before.raw, body.body)
        );
        const after = await current.readDocument({ path: body.path });
        writeJson(response, 200, {
          ok: true,
          project: summarizeProject(current),
          document: toWorkspaceDocument(current, after),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/project/new") {
        const body = await readJsonBody(request);
        await initializeProject(projectRoot, titleFromBody(body));
        project = await openProject(projectRoot);
        writeJson(response, 201, { ok: true, project: summarizeProject(project) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/project/mutation") {
        const current = await ensureProject();
        const body = await readJsonBody(request);
        if (!isRecord(body) || typeof body.action !== "string") {
          writeJson(response, 400, {
            ok: false,
            error: { code: "BAD_REQUEST", message: "Expected JSON body with action" },
          });
          return;
        }

        const mutation = await applyProjectMutation(current, body);
        project = await openProject(projectRoot);
        writeJson(response, 200, {
          ok: true,
          project: summarizeProject(project),
          ...(mutation.chapter === undefined
            ? {}
            : {
                chapter: toWorkspaceChapter(
                  mutation.chapter,
                  project
                    .listScenes()
                    .filter((scene) => scene.chapterId === mutation.chapter?.id)
                    .map(toWorkspaceScene)
                ),
              }),
          ...(mutation.scene === undefined ? {} : { scene: toWorkspaceScene(mutation.scene) }),
          ...(mutation.nextPath === undefined ? {} : { nextPath: mutation.nextPath }),
          ...(mutation.pathMap === undefined ? {} : { pathMap: mutation.pathMap }),
          ...(mutation.chapterIdMap === undefined ? {} : { chapterIdMap: mutation.chapterIdMap }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/reload") {
        project = await openProject(projectRoot);
        writeJson(response, 200, { ok: true, project: summarizeProject(project) });
        return;
      }

      writeJson(response, 404, {
        ok: false,
        error: { code: "NOT_FOUND", message: "Unknown endpoint" },
      });
    } catch (error) {
      const status = error instanceof CompanionError ? error.status : 500;
      const code = error instanceof CompanionError ? error.code : "INTERNAL_ERROR";
      const message = error instanceof Error ? error.message : "Internal error";
      writeJson(response, status, { ok: false, error: { code, message } });
    }
  });

  async function ensureProject(): Promise<ClarosProject> {
    project ??= await openProject(projectRoot);
    return project;
  }

  return {
    server,
    token,
    listen(port: number, host = "127.0.0.1"): Promise<{ port: number; host: string }> {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          const address = server.address();
          resolve({
            host,
            port: typeof address === "object" && address !== null ? address.port : port,
          });
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function initializeProject(projectRoot: string, title = "Untitled Project"): Promise<void> {
  if (await exists(path.join(projectRoot, "claros.yaml"))) {
    throw new CompanionError(409, "PROJECT_EXISTS", "claros.yaml already exists");
  }

  await mkdir(path.join(projectRoot, "manuscript", "001-draft"), { recursive: true });
  await mkdir(path.join(projectRoot, "notes"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "claros.yaml"),
    `claros: 1\ntitle: ${JSON.stringify(normalizedProjectTitle(title))}\n`,
    {
      encoding: "utf8",
      flag: "wx",
    }
  );
  await writeFile(
    path.join(projectRoot, "manuscript", "001-draft", "chapter.yaml"),
    "title: Draft\n",
    { encoding: "utf8", flag: "wx" }
  );
  await writeFile(
    path.join(projectRoot, "manuscript", "001-draft", "001-opening.md"),
    "---\ntitle: Opening\n---\n\n# Draft\n\n## Opening\n\n",
    { encoding: "utf8", flag: "wx" }
  );
}

async function hasProject(projectRoot: string): Promise<boolean> {
  return exists(path.join(projectRoot, "claros.yaml"));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function summarizeProject(project: ClarosProject): ProjectSummary {
  const scenesByChapter = new Map<string, WorkspaceScene[]>();
  for (const scene of project.listScenes()) {
    const scenes = scenesByChapter.get(scene.chapterId) ?? [];
    scenes.push(toWorkspaceScene(scene));
    scenesByChapter.set(scene.chapterId, scenes);
  }

  return {
    manifest: normalizeManifest(project.manifest),
    chapters: project
      .listChapters()
      .map((chapter) => toWorkspaceChapter(chapter, scenesByChapter.get(chapter.id) ?? [])),
    notes: project.listNotes().map(toWorkspaceNote),
  };
}

async function applyProjectMutation(
  project: ClarosProject,
  body: Record<string, unknown>
): Promise<{
  chapter?: ChapterRef;
  scene?: SceneRef;
  nextPath?: string;
  pathMap?: Record<string, string>;
  chapterIdMap?: Record<string, string>;
}> {
  const title = typeof body.title === "string" ? body.title : "";
  switch (body.action) {
    case "set-project-title":
      await project.setProjectTitle(title);
      return {};
    case "append-chapter": {
      const sceneTitle = typeof body.sceneTitle === "string" ? body.sceneTitle : "";
      const { scene } = await project.appendChapter(title, sceneTitle);
      return { scene };
    }
    case "append-scene": {
      const { scene } = await project.appendScene(title);
      return { scene };
    }
    case "create-chapter": {
      const sceneTitle = typeof body.sceneTitle === "string" ? body.sceneTitle : "";
      const { scene } = await project.createChapter(title, sceneTitle, {
        placement: insertionPlacement(body.placement),
        targetChapter: stringValue(body.targetChapterId),
      });
      return { scene };
    }
    case "create-scene": {
      const { scene } = await project.createScene(title, {
        placement: insertionPlacement(body.placement),
        targetScene: stringValue(body.targetScenePath),
      });
      return { scene };
    }
    case "set-chapter-title":
      if (typeof body.chapterId !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected chapterId");
      }
      const currentChapter = project
        .listChapters()
        .find((chapter) => chapter.id === body.chapterId);
      await project.setChapterTitle(body.chapterId, title);
      return {
        chapter: project
          .listChapters()
          .find((chapter) => chapter.sequence === currentChapter?.sequence),
      };
    case "set-scene-title":
      if (typeof body.path !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected path");
      }
      const currentScene = project.listScenes().find((scene) => scene.path === body.path);
      await project.setSceneTitle(body.path, title);
      return {
        scene: project.listScenes().find((scene) => scene.sequence === currentScene?.sequence),
      };
    case "delete-chapter": {
      if (typeof body.chapterId !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected chapterId");
      }
      const { nextScene } = await project.deleteChapter(body.chapterId);
      return { nextPath: nextScene?.path };
    }
    case "delete-scene": {
      if (typeof body.path !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected path");
      }
      const { nextScene } = await project.deleteScene(body.path);
      return { nextPath: nextScene?.path };
    }
    case "move-chapter": {
      if (typeof body.chapterId !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected chapterId");
      }
      if (typeof body.targetChapterId !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected targetChapterId");
      }
      const { chapter, pathMap, chapterIdMap } = await project.moveChapter(body.chapterId, {
        placement: movePlacement(body.placement),
        targetChapter: body.targetChapterId,
      });
      return { chapter, pathMap, chapterIdMap };
    }
    case "move-scene": {
      if (typeof body.path !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected path");
      }
      const { scene, pathMap, chapterIdMap } = await project.moveScene(body.path, {
        placement: insertionPlacement(body.placement) ?? "append",
        targetScene: stringValue(body.targetScenePath),
        targetChapter: stringValue(body.targetChapterId),
      });
      return { scene, pathMap, chapterIdMap };
    }
    default:
      throw new CompanionError(400, "BAD_REQUEST", `Unknown project mutation: ${body.action}`);
  }
}

function titleFromBody(body: unknown): string {
  return isRecord(body) && typeof body.title === "string" ? body.title : "Untitled Project";
}

function insertionPlacement(value: unknown): "append" | "before" | "after" | undefined {
  return value === "append" || value === "before" || value === "after" ? value : undefined;
}

function movePlacement(value: unknown): "before" | "after" {
  if (value !== "before" && value !== "after") {
    throw new CompanionError(400, "BAD_REQUEST", "Expected before or after placement");
  }
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizedProjectTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Project";
}

function normalizeManifest(manifest: ProjectManifest): WorkspaceManifest {
  return {
    title: typeof manifest.title === "string" && manifest.title.trim() ? manifest.title : "Claros",
  };
}

function toWorkspaceChapter(chapter: ChapterRef, scenes: WorkspaceScene[]): WorkspaceChapter {
  return {
    kind: "chapter",
    id: chapter.id,
    sequence: chapter.sequence,
    title: chapter.title || `Chapter ${chapter.sequence}`,
    scenes,
  };
}

function toWorkspaceScene(scene: SceneRef): WorkspaceScene {
  return {
    kind: "scene",
    id: scene.id,
    chapterId: scene.chapterId,
    sequence: scene.sequence,
    title: scene.title || `Scene ${scene.sequence}`,
    path: scene.path,
  };
}

function toWorkspaceNote(note: NoteRef): WorkspaceNote {
  return {
    kind: "note",
    id: note.path,
    path: note.path,
    title: note.title || titleFromSlug(note.slug),
    folderPath: note.path.startsWith("notes/")
      ? note.path.slice("notes/".length).split("/").slice(0, -1)
      : [],
  };
}

function toWorkspaceDocument(
  project: ClarosProject,
  document: MarkdownDocument
): WorkspaceDocument {
  const scene = project.listScenes().find((candidate) => candidate.path === document.path);
  if (scene !== undefined) {
    return {
      path: document.path,
      raw: document.raw,
      body: document.body,
      title: scene.title || `Scene ${scene.sequence}`,
      kind: "scene",
    };
  }

  const note = project.listNotes().find((candidate) => candidate.path === document.path);
  return {
    path: document.path,
    raw: document.raw,
    body: document.body,
    title: note?.title || document.path,
    kind: "note",
  };
}

function ensureKnownDocumentPath(project: ClarosProject, candidatePath: string): void {
  if (candidatePath.includes("..") || path.isAbsolute(candidatePath)) {
    throw new CompanionError(400, "INVALID_PATH", "Document path must be project-relative");
  }

  const knownPaths = new Set([
    ...project.listScenes().map((scene) => scene.path),
    ...project.listNotes().map((note) => note.path),
  ]);
  if (!knownPaths.has(candidatePath)) {
    throw new CompanionError(404, "DOCUMENT_NOT_FOUND", `Unknown document path: ${candidatePath}`);
  }
}

function handleCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: Set<string>
): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) {
    return true;
  }
  if (!allowedOrigins.has(origin)) {
    writeJson(response, 403, {
      ok: false,
      error: { code: "ORIGIN_FORBIDDEN", message: `Origin is not allowed: ${origin}` },
    });
    return false;
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "authorization,content-type,x-claros-token");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  return true;
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const authorization = request.headers.authorization;
  if (authorization === `Bearer ${token}`) {
    return true;
  }
  return request.headers["x-claros-token"] === token;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { frontmatter: "", body: raw };
  }

  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?(?:\r?\n)?/.exec(raw);
  if (match === null) {
    return { frontmatter: "", body: raw };
  }

  return {
    frontmatter: match[0],
    body: raw.slice(match[0].length),
  };
}

function mergeBodyWithExistingFrontmatter(previousRaw: string, body: string): string {
  const { frontmatter } = splitFrontmatter(previousRaw);
  return frontmatter.length === 0 ? body : `${frontmatter}${body}`;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class CompanionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CompanionError";
  }
}
