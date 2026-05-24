import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import * as path from "node:path";
import {
  NodeProjectFileReader,
  NodeProjectFileWriter,
  ProjectAlreadyExistsError,
  initializeProjectFiles,
  openProject,
  replaceMarkdownBodyPreservingFrontmatter,
  summarizeWorkspaceProject,
  toWorkspaceChapter,
  toWorkspaceDocument,
  toWorkspaceLinkResolution,
  toWorkspaceNote,
  toWorkspaceNoteFolder,
  toWorkspaceScene,
  type ChapterRef,
  type ClarosProject,
  type NoteFolderRef,
  type NoteRef,
  type SceneRef,
  type WorkspaceProjectSummary,
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

export type ProjectSummary = WorkspaceProjectSummary;

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
        writeJson(response, 200, { ok: true, project: summarizeWorkspaceProject(project) });
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
          replaceMarkdownBodyPreservingFrontmatter(before.raw, body.body)
        );
        const after = await current.readDocument({ path: body.path });
        writeJson(response, 200, {
          ok: true,
          project: summarizeWorkspaceProject(current),
          document: toWorkspaceDocument(current, after),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/project/new") {
        const body = await readJsonBody(request);
        await initializeProject(projectRoot, titleFromBody(body));
        project = await openProject(projectRoot);
        writeJson(response, 201, { ok: true, project: summarizeWorkspaceProject(project) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/wikilink") {
        const current = await ensureProject();
        const link = url.searchParams.get("link") ?? "";
        const fromPath = url.searchParams.get("fromPath") ?? undefined;
        const resolution = current.resolveWikilink(
          link,
          fromPath === undefined ? undefined : { path: fromPath }
        );
        writeJson(response, 200, {
          ok: true,
          resolution: toWorkspaceLinkResolution(resolution),
        });
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
          project: summarizeWorkspaceProject(project),
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
          ...(mutation.note === undefined ? {} : { note: toWorkspaceNote(mutation.note) }),
          ...(mutation.noteFolder === undefined
            ? {}
            : { noteFolder: toWorkspaceNoteFolder(mutation.noteFolder) }),
          ...(mutation.nextPath === undefined ? {} : { nextPath: mutation.nextPath }),
          ...(mutation.pathMap === undefined ? {} : { pathMap: mutation.pathMap }),
          ...(mutation.chapterIdMap === undefined ? {} : { chapterIdMap: mutation.chapterIdMap }),
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/reload") {
        project = await openProject(projectRoot);
        writeJson(response, 200, { ok: true, project: summarizeWorkspaceProject(project) });
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
  const reader = new NodeProjectFileReader();
  const writer = new NodeProjectFileWriter();
  try {
    await initializeProjectFiles(projectRoot, reader, writer, { title });
  } catch (error) {
    if (error instanceof ProjectAlreadyExistsError) {
      throw new CompanionError(409, "PROJECT_EXISTS", error.message);
    }
    throw error;
  }
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

async function applyProjectMutation(
  project: ClarosProject,
  body: Record<string, unknown>
): Promise<{
  chapter?: ChapterRef;
  scene?: SceneRef;
  note?: NoteRef;
  noteFolder?: NoteFolderRef;
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
    case "create-note": {
      const { note } = await project.createNote(title, {
        folderPath: stringArrayValue(body.folderPath),
      });
      return { note };
    }
    case "create-note-folder": {
      const { folder } = await project.createNoteFolder(title, {
        parentFolderPath: stringArrayValue(body.parentFolderPath),
      });
      return { noteFolder: folder };
    }
    case "delete-note": {
      if (typeof body.path !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected path");
      }
      const { nextDocument } = await project.deleteNote(body.path);
      return { nextPath: nextDocument?.path };
    }
    case "delete-note-folder": {
      if (typeof body.folderPath !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected folderPath");
      }
      const { nextDocument } = await project.deleteNoteFolder(body.folderPath);
      return { nextPath: nextDocument?.path };
    }
    case "move-note": {
      if (typeof body.path !== "string") {
        throw new CompanionError(400, "BAD_REQUEST", "Expected path");
      }
      const { note } = await project.moveNote(body.path, {
        targetFolderPath: stringArrayValue(body.targetFolderPath),
      });
      return { note };
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

function stringArrayValue(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
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
