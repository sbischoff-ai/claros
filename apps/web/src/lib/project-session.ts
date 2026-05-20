import { openProject as openBrowserProject } from "@claros/story-state/browser";
import type {
  ChapterRef,
  ClarosProject,
  MarkdownDocument,
  NoteRef,
  ProjectManifest,
  SceneRef,
} from "@claros/story-state";
import { BrowserProjectFileSystem, type DirectoryHandle } from "./browser-file-system";

export const COMPANION_STORAGE_KEY = "claros.web.localCompanion.v1";

export interface ProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface WorkspaceManifest {
  title: string;
}

export interface WorkspaceChapter {
  kind: "chapter";
  id: string;
  sequence: number;
  title: string;
  scenes: WorkspaceScene[];
}

export interface WorkspaceScene {
  kind: "scene";
  id: string;
  chapterId: string;
  sequence: number;
  title: string;
  path: string;
}

export interface WorkspaceNote {
  kind: "note";
  id: string;
  path: string;
  title: string;
  folderPath: string[];
}

export type WorkspaceDocumentRef = WorkspaceScene | WorkspaceNote | { path: string };

export interface WorkspaceDocument {
  path: string;
  raw: string;
  body: string;
  title: string;
  kind: "scene" | "note";
}

export interface ProjectSession {
  readonly manifest: WorkspaceManifest;
  listChapters(): WorkspaceChapter[];
  listScenes(): WorkspaceScene[];
  listNotes(): WorkspaceNote[];
  readDocument(ref: WorkspaceDocumentRef): Promise<WorkspaceDocument>;
  writeDocument(ref: WorkspaceDocumentRef, body: string): Promise<void>;
}

interface ProjectSummary {
  manifest: WorkspaceManifest;
  chapters: WorkspaceChapter[];
  notes: WorkspaceNote[];
}

export interface CompanionConnection {
  url: string;
  token: string;
}

export async function openLocalProjectSession(handle: DirectoryHandle): Promise<ProjectSession> {
  const fileSystem = new BrowserProjectFileSystem(handle);
  const project = await openBrowserProject("/", {
    fileReader: fileSystem,
    fileWriter: fileSystem,
  });
  return createProjectSession(project);
}

export async function createNewLocalProjectSession(
  handle: DirectoryHandle
): Promise<ProjectSession> {
  const fileSystem = new BrowserProjectFileSystem(handle);
  await initializeNewProject(fileSystem);
  return openLocalProjectSession(handle);
}

export async function openCompanionProjectSession(
  connection: CompanionConnection
): Promise<ProjectSession> {
  const response = await companionFetch(connection, "/api/project");
  return createCompanionProjectSession(connection, projectFromResponse(response));
}

export async function createNewCompanionProjectSession(
  connection: CompanionConnection
): Promise<ProjectSession> {
  const response = await companionFetch(connection, "/api/project/new", { method: "POST" });
  return createCompanionProjectSession(connection, projectFromResponse(response));
}

export function loadCompanionConnection(storage: ProjectStorage): CompanionConnection | undefined {
  const stored = storage.getItem(COMPANION_STORAGE_KEY);
  if (stored === null) {
    return undefined;
  }
  try {
    return normalizeCompanionConnection(JSON.parse(stored));
  } catch {
    return undefined;
  }
}

export function saveCompanionConnection(
  storage: ProjectStorage,
  connection: CompanionConnection
): void {
  storage.setItem(COMPANION_STORAGE_KEY, JSON.stringify(connection));
}

export function companionConnectionFromUrl(url: URL): CompanionConnection | undefined {
  const companionUrl = url.searchParams.get("clarosCompanion");
  const token = url.searchParams.get("clarosToken");
  if (companionUrl === null || token === null) {
    return undefined;
  }
  return normalizeCompanionConnection({ url: companionUrl, token });
}

export function firstDocumentPath(session: ProjectSession): string {
  return session.listScenes()[0]?.path ?? session.listNotes()[0]?.path ?? "";
}

export function documentPath(ref: WorkspaceDocumentRef): string {
  return ref.path;
}

function createProjectSession(project: ClarosProject): ProjectSession {
  return {
    manifest: normalizeManifest(project.manifest),
    listChapters(): WorkspaceChapter[] {
      const scenesByChapter = new Map<string, WorkspaceScene[]>();
      for (const scene of project.listScenes()) {
        const scenes = scenesByChapter.get(scene.chapterId) ?? [];
        scenes.push(toWorkspaceScene(scene));
        scenesByChapter.set(scene.chapterId, scenes);
      }

      return project
        .listChapters()
        .map((chapter) => toWorkspaceChapter(chapter, scenesByChapter.get(chapter.id) ?? []));
    },
    listScenes(): WorkspaceScene[] {
      return project.listScenes().map(toWorkspaceScene);
    },
    listNotes(): WorkspaceNote[] {
      return project.listNotes().map(toWorkspaceNote);
    },
    async readDocument(ref: WorkspaceDocumentRef): Promise<WorkspaceDocument> {
      const path = documentPath(ref);
      const document = await project.readDocument({ path });
      return toWorkspaceDocument(project, document);
    },
    async writeDocument(ref: WorkspaceDocumentRef, body: string): Promise<void> {
      const path = documentPath(ref);
      const current = await project.readDocument({ path });
      await project.writeDocument({ path }, mergeBodyWithExistingFrontmatter(current.raw, body));
    },
  };
}

function createCompanionProjectSession(
  connection: CompanionConnection,
  initialSummary: ProjectSummary
): ProjectSession {
  let summary = initialSummary;

  return {
    get manifest(): WorkspaceManifest {
      return summary.manifest;
    },
    listChapters(): WorkspaceChapter[] {
      return cloneSummary(summary).chapters;
    },
    listScenes(): WorkspaceScene[] {
      return summary.chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({ ...scene })));
    },
    listNotes(): WorkspaceNote[] {
      return summary.notes.map((note) => ({ ...note, folderPath: [...note.folderPath] }));
    },
    async readDocument(ref: WorkspaceDocumentRef): Promise<WorkspaceDocument> {
      const path = documentPath(ref);
      const response = await companionFetch(
        connection,
        `/api/document?path=${encodeURIComponent(path)}`
      );
      return documentFromResponse(response);
    },
    async writeDocument(ref: WorkspaceDocumentRef, body: string): Promise<void> {
      const response = await companionFetch(connection, "/api/document", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: documentPath(ref), body }),
      });
      summary = projectFromResponse(response);
    },
  };
}

async function initializeNewProject(fileSystem: BrowserProjectFileSystem): Promise<void> {
  const manifestStat = await fileSystem.stat("/claros.yaml");
  if (manifestStat.exists) {
    throw new Error("claros.yaml already exists");
  }

  await fileSystem.mkdir("/manuscript/01-draft", true);
  await fileSystem.mkdir("/notes", true);
  await fileSystem.writeFileAtomic("/claros.yaml", "claros: 1\ntitle: Untitled Project\n");
  await fileSystem.writeFileAtomic("/manuscript/01-draft/chapter.yaml", "title: Draft\n");
  await fileSystem.writeFileAtomic(
    "/manuscript/01-draft/01-opening.md",
    "---\ntitle: Opening\n---\n\n# Draft\n\n## Opening\n\n"
  );
}

async function companionFetch(
  connection: CompanionConnection,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const baseUrl = connection.url.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${connection.token}`,
    },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(errorMessageFromResponse(body, response.statusText));
  }
  return body;
}

function errorMessageFromResponse(body: unknown, fallback: string): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== "string") {
    return fallback;
  }
  return body.error.message;
}

function projectFromResponse(response: unknown): ProjectSummary {
  if (!isRecord(response) || !isRecord(response.project)) {
    throw new Error("Companion response did not include a project");
  }
  return normalizeProjectSummary(response.project);
}

function documentFromResponse(response: unknown): WorkspaceDocument {
  if (!isRecord(response) || !isRecord(response.document)) {
    throw new Error("Companion response did not include a document");
  }
  const document = response.document;
  if (
    typeof document.path !== "string" ||
    typeof document.raw !== "string" ||
    typeof document.body !== "string" ||
    typeof document.title !== "string" ||
    (document.kind !== "scene" && document.kind !== "note")
  ) {
    throw new Error("Companion returned an invalid document");
  }
  return {
    path: document.path,
    raw: document.raw,
    body: document.body,
    title: document.title,
    kind: document.kind,
  };
}

function normalizeProjectSummary(value: unknown): ProjectSummary {
  if (!isRecord(value) || !isRecord(value.manifest) || !Array.isArray(value.chapters)) {
    throw new Error("Companion returned an invalid project");
  }
  return {
    manifest: {
      title: typeof value.manifest.title === "string" ? value.manifest.title : "Claros",
    },
    chapters: value.chapters.map(normalizeWorkspaceChapter),
    notes: Array.isArray(value.notes) ? value.notes.map(normalizeWorkspaceNote) : [],
  };
}

function normalizeWorkspaceChapter(value: unknown): WorkspaceChapter {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.sequence !== "number") {
    throw new Error("Companion returned an invalid chapter");
  }
  return {
    kind: "chapter",
    id: value.id,
    sequence: value.sequence,
    title: typeof value.title === "string" ? value.title : `Chapter ${value.sequence}`,
    scenes: Array.isArray(value.scenes) ? value.scenes.map(normalizeWorkspaceScene) : [],
  };
}

function normalizeWorkspaceScene(value: unknown): WorkspaceScene {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.chapterId !== "string" ||
    typeof value.sequence !== "number" ||
    typeof value.path !== "string"
  ) {
    throw new Error("Companion returned an invalid scene");
  }
  return {
    kind: "scene",
    id: value.id,
    chapterId: value.chapterId,
    sequence: value.sequence,
    title: typeof value.title === "string" ? value.title : `Scene ${value.sequence}`,
    path: value.path,
  };
}

function normalizeWorkspaceNote(value: unknown): WorkspaceNote {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.path !== "string") {
    throw new Error("Companion returned an invalid note");
  }
  return {
    kind: "note",
    id: value.id,
    path: value.path,
    title: typeof value.title === "string" ? value.title : value.path,
    folderPath: Array.isArray(value.folderPath)
      ? value.folderPath.filter((part): part is string => typeof part === "string")
      : [],
  };
}

function normalizeCompanionConnection(value: unknown): CompanionConnection | undefined {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.token !== "string") {
    return undefined;
  }
  return {
    url: value.url,
    token: value.token,
  };
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
  if (frontmatter.length === 0) {
    return body;
  }

  return `${frontmatter}${body}`;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function cloneSummary(summary: ProjectSummary): ProjectSummary {
  return {
    manifest: { ...summary.manifest },
    chapters: summary.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.map((scene) => ({ ...scene })),
    })),
    notes: summary.notes.map((note) => ({ ...note, folderPath: [...note.folderPath] })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
