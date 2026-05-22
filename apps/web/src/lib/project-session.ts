import { openProject as openBrowserProject } from "@claros/story-state/browser";
import type {
  ChapterRef,
  ClarosProject,
  LinkResolution,
  ManuscriptInsertionPlacement,
  MoveChapterOptions,
  MoveSceneOptions,
  MarkdownDocument,
  NoteFolderRef,
  NoteRef,
  ProjectManifest,
  SceneRef,
} from "@claros/story-state/browser";
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

export interface WorkspaceNoteFolder {
  kind: "note-folder";
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
  listNoteFolders(): WorkspaceNoteFolder[];
  readDocument(ref: WorkspaceDocumentRef): Promise<WorkspaceDocument>;
  writeDocument(ref: WorkspaceDocumentRef, body: string): Promise<void>;
  setProjectTitle(title: string): Promise<void>;
  appendChapter(chapterTitle: string, sceneTitle?: string): Promise<WorkspaceScene>;
  appendScene(title: string): Promise<WorkspaceScene>;
  createChapter(
    chapterTitle: string,
    sceneTitle?: string,
    options?: WorkspaceCreateChapterOptions
  ): Promise<WorkspaceScene>;
  createScene(title: string, options?: WorkspaceCreateSceneOptions): Promise<WorkspaceScene>;
  setChapterTitle(chapterId: string, title: string): Promise<WorkspaceChapter>;
  setSceneTitle(scenePath: string, title: string): Promise<WorkspaceScene>;
  deleteChapter(chapterId: string): Promise<string>;
  deleteScene(scenePath: string): Promise<string>;
  moveChapter(
    chapterId: string,
    options: WorkspaceMoveChapterOptions
  ): Promise<WorkspaceMoveResult & { chapter: WorkspaceChapter }>;
  moveScene(
    scenePath: string,
    options: WorkspaceMoveSceneOptions
  ): Promise<WorkspaceMoveResult & { scene: WorkspaceScene }>;
  createNote(title: string, options?: WorkspaceCreateNoteOptions): Promise<WorkspaceNote>;
  createNoteFolder(
    title: string,
    options?: WorkspaceCreateNoteFolderOptions
  ): Promise<WorkspaceNoteFolder>;
  deleteNote(notePath: string): Promise<string>;
  deleteNoteFolder(folderPath: string): Promise<string>;
  moveNote(notePath: string, options: WorkspaceMoveNoteOptions): Promise<WorkspaceNote>;
  resolveWikilink(link: string, fromPath?: string): WorkspaceLinkResolution;
}

export interface WorkspaceCreateSceneOptions {
  placement?: ManuscriptInsertionPlacement;
  targetScenePath?: string;
}

export interface WorkspaceCreateChapterOptions {
  placement?: ManuscriptInsertionPlacement;
  targetChapterId?: string;
}

export interface WorkspaceCreateNoteOptions {
  folderPath?: string[];
}

export interface WorkspaceCreateNoteFolderOptions {
  parentFolderPath?: string[];
}

export interface WorkspaceMoveNoteOptions {
  targetFolderPath?: string[];
}

export type WorkspaceMoveChapterOptions = Omit<MoveChapterOptions, "targetChapter"> & {
  targetChapterId: string;
};

export type WorkspaceMoveSceneOptions = Omit<MoveSceneOptions, "targetScene" | "targetChapter"> & {
  targetScenePath?: string;
  targetChapterId?: string;
};

export interface WorkspaceMoveResult {
  pathMap: Record<string, string>;
  chapterIdMap: Record<string, string>;
}

export type WorkspaceLinkResolution =
  | { status: "resolved"; path: string; reason: string }
  | { status: "ambiguous"; candidates: WorkspaceNote[]; reason: string }
  | { status: "unresolved" };

interface ProjectSummary {
  manifest: WorkspaceManifest;
  chapters: WorkspaceChapter[];
  notes: WorkspaceNote[];
  noteFolders: WorkspaceNoteFolder[];
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
  handle: DirectoryHandle,
  title = "Untitled Project"
): Promise<ProjectSession> {
  const fileSystem = new BrowserProjectFileSystem(handle);
  await initializeNewProject(fileSystem, title);
  return openLocalProjectSession(handle);
}

export async function openCompanionProjectSession(
  connection: CompanionConnection
): Promise<ProjectSession> {
  const response = await companionFetch(connection, "/api/project");
  return createCompanionProjectSession(connection, projectFromResponse(response));
}

export async function createNewCompanionProjectSession(
  connection: CompanionConnection,
  title = "Untitled Project"
): Promise<ProjectSession> {
  const response = await companionFetch(connection, "/api/project/new", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: normalizedProjectTitle(title) }),
  });
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
  let manifest = normalizeManifest(project.manifest);
  return {
    get manifest(): WorkspaceManifest {
      return manifest;
    },
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
    listNoteFolders(): WorkspaceNoteFolder[] {
      return listProjectNoteFolders(project).map(toWorkspaceNoteFolder);
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
    async setProjectTitle(title: string): Promise<void> {
      const normalized = normalizedProjectTitle(title);
      await project.setProjectTitle(normalized);
      manifest = { title: normalized };
    },
    async appendChapter(chapterTitle: string, sceneTitle?: string): Promise<WorkspaceScene> {
      const { scene } = await project.appendChapter(chapterTitle, sceneTitle);
      return toWorkspaceScene(scene);
    },
    async appendScene(title: string): Promise<WorkspaceScene> {
      const { scene } = await project.appendScene(title);
      return toWorkspaceScene(scene);
    },
    async createChapter(
      chapterTitle: string,
      sceneTitle?: string,
      options?: WorkspaceCreateChapterOptions
    ): Promise<WorkspaceScene> {
      const { scene } = await project.createChapter(chapterTitle, sceneTitle, {
        placement: options?.placement,
        targetChapter: options?.targetChapterId,
      });
      return toWorkspaceScene(scene);
    },
    async createScene(
      title: string,
      options?: WorkspaceCreateSceneOptions
    ): Promise<WorkspaceScene> {
      const { scene } = await project.createScene(title, {
        placement: options?.placement,
        targetScene: options?.targetScenePath,
      });
      return toWorkspaceScene(scene);
    },
    async setChapterTitle(chapterId: string, title: string): Promise<WorkspaceChapter> {
      const current = project.listChapters().find((chapter) => chapter.id === chapterId);
      await project.setChapterTitle(chapterId, title);
      const chapter = project
        .listChapters()
        .find((candidate) => candidate.sequence === current?.sequence);
      if (chapter === undefined) {
        throw new Error(`Chapter not found after title update: ${chapterId}`);
      }
      return toWorkspaceChapter(
        chapter,
        project
          .listScenes()
          .filter((scene) => scene.chapterId === chapter.id)
          .map(toWorkspaceScene)
      );
    },
    async setSceneTitle(scenePath: string, title: string): Promise<WorkspaceScene> {
      const current = project.listScenes().find((scene) => scene.path === scenePath);
      await project.setSceneTitle(scenePath, title);
      const scene = project
        .listScenes()
        .find((candidate) => candidate.sequence === current?.sequence);
      if (scene === undefined) {
        throw new Error(`Scene not found after title update: ${scenePath}`);
      }
      return toWorkspaceScene(scene);
    },
    async deleteChapter(chapterId: string): Promise<string> {
      const { nextScene } = await project.deleteChapter(chapterId);
      return nextScene?.path ?? firstDocumentPath(this);
    },
    async deleteScene(scenePath: string): Promise<string> {
      const { nextScene } = await project.deleteScene(scenePath);
      return nextScene?.path ?? firstDocumentPath(this);
    },
    async moveChapter(
      chapterId: string,
      options: WorkspaceMoveChapterOptions
    ): Promise<WorkspaceMoveResult & { chapter: WorkspaceChapter }> {
      const { chapter, pathMap, chapterIdMap } = await project.moveChapter(chapterId, {
        placement: options.placement,
        targetChapter: options.targetChapterId,
      });
      return {
        pathMap,
        chapterIdMap,
        chapter: toWorkspaceChapter(
          chapter,
          project
            .listScenes()
            .filter((scene) => scene.chapterId === chapter.id)
            .map(toWorkspaceScene)
        ),
      };
    },
    async moveScene(
      scenePath: string,
      options: WorkspaceMoveSceneOptions
    ): Promise<WorkspaceMoveResult & { scene: WorkspaceScene }> {
      const { scene, pathMap, chapterIdMap } = await project.moveScene(scenePath, {
        placement: options.placement,
        targetScene: options.targetScenePath,
        targetChapter: options.targetChapterId,
      });
      return { pathMap, chapterIdMap, scene: toWorkspaceScene(scene) };
    },
    async createNote(title: string, options?: WorkspaceCreateNoteOptions): Promise<WorkspaceNote> {
      const { note } = await project.createNote(title, { folderPath: options?.folderPath });
      return toWorkspaceNote(note);
    },
    async createNoteFolder(
      title: string,
      options?: WorkspaceCreateNoteFolderOptions
    ): Promise<WorkspaceNoteFolder> {
      const { folder } = await project.createNoteFolder(title, {
        parentFolderPath: options?.parentFolderPath,
      });
      return toWorkspaceNoteFolder(folder);
    },
    async deleteNote(notePath: string): Promise<string> {
      const { nextDocument } = await project.deleteNote(notePath);
      return nextDocument?.path ?? firstDocumentPath(this);
    },
    async deleteNoteFolder(folderPath: string): Promise<string> {
      const { nextDocument } = await project.deleteNoteFolder(folderPath);
      return nextDocument?.path ?? firstDocumentPath(this);
    },
    async moveNote(notePath: string, options: WorkspaceMoveNoteOptions): Promise<WorkspaceNote> {
      const { note } = await project.moveNote(notePath, {
        targetFolderPath: options.targetFolderPath,
      });
      return toWorkspaceNote(note);
    },
    resolveWikilink(link: string, fromPath?: string): WorkspaceLinkResolution {
      const resolution = project.resolveWikilink(
        link,
        fromPath === undefined ? undefined : { path: fromPath }
      );
      return toWorkspaceLinkResolution(resolution);
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
    listNoteFolders(): WorkspaceNoteFolder[] {
      return summary.noteFolders.map((folder) => ({
        ...folder,
        folderPath: [...folder.folderPath],
      }));
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
    async setProjectTitle(title: string): Promise<void> {
      summary = await mutateCompanionProject(connection, {
        action: "set-project-title",
        title: normalizedProjectTitle(title),
      });
    },
    async appendChapter(chapterTitle: string, sceneTitle?: string): Promise<WorkspaceScene> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "append-chapter", title: chapterTitle, sceneTitle }),
      });
      summary = projectFromResponse(response);
      return sceneFromMutationResponse(response);
    },
    async appendScene(title: string): Promise<WorkspaceScene> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "append-scene", title }),
      });
      summary = projectFromResponse(response);
      return sceneFromMutationResponse(response);
    },
    async createChapter(
      chapterTitle: string,
      sceneTitle?: string,
      options?: WorkspaceCreateChapterOptions
    ): Promise<WorkspaceScene> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-chapter",
          title: chapterTitle,
          sceneTitle,
          placement: options?.placement,
          targetChapterId: options?.targetChapterId,
        }),
      });
      summary = projectFromResponse(response);
      return sceneFromMutationResponse(response);
    },
    async createScene(
      title: string,
      options?: WorkspaceCreateSceneOptions
    ): Promise<WorkspaceScene> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-scene",
          title,
          placement: options?.placement,
          targetScenePath: options?.targetScenePath,
        }),
      });
      summary = projectFromResponse(response);
      return sceneFromMutationResponse(response);
    },
    async setChapterTitle(chapterId: string, title: string): Promise<WorkspaceChapter> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set-chapter-title",
          chapterId,
          title,
        }),
      });
      summary = projectFromResponse(response);
      return chapterFromMutationResponse(response);
    },
    async setSceneTitle(scenePath: string, title: string): Promise<WorkspaceScene> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set-scene-title",
          path: scenePath,
          title,
        }),
      });
      summary = projectFromResponse(response);
      return sceneFromMutationResponse(response);
    },
    async deleteChapter(chapterId: string): Promise<string> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-chapter", chapterId }),
      });
      summary = projectFromResponse(response);
      return nextPathFromMutationResponse(response) ?? firstDocumentPath(this);
    },
    async deleteScene(scenePath: string): Promise<string> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-scene", path: scenePath }),
      });
      summary = projectFromResponse(response);
      return nextPathFromMutationResponse(response) ?? firstDocumentPath(this);
    },
    async moveChapter(
      chapterId: string,
      options: WorkspaceMoveChapterOptions
    ): Promise<WorkspaceMoveResult & { chapter: WorkspaceChapter }> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "move-chapter",
          chapterId,
          placement: options.placement,
          targetChapterId: options.targetChapterId,
        }),
      });
      summary = projectFromResponse(response);
      return {
        ...moveResultFromMutationResponse(response),
        chapter: chapterFromMutationResponse(response),
      };
    },
    async moveScene(
      scenePath: string,
      options: WorkspaceMoveSceneOptions
    ): Promise<WorkspaceMoveResult & { scene: WorkspaceScene }> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "move-scene",
          path: scenePath,
          placement: options.placement,
          targetScenePath: options.targetScenePath,
          targetChapterId: options.targetChapterId,
        }),
      });
      summary = projectFromResponse(response);
      return {
        ...moveResultFromMutationResponse(response),
        scene: sceneFromMutationResponse(response),
      };
    },
    async createNote(title: string, options?: WorkspaceCreateNoteOptions): Promise<WorkspaceNote> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-note",
          title,
          folderPath: options?.folderPath,
        }),
      });
      summary = projectFromResponse(response);
      return noteFromMutationResponse(response);
    },
    async createNoteFolder(
      title: string,
      options?: WorkspaceCreateNoteFolderOptions
    ): Promise<WorkspaceNoteFolder> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-note-folder",
          title,
          parentFolderPath: options?.parentFolderPath,
        }),
      });
      summary = projectFromResponse(response);
      return noteFolderFromMutationResponse(response);
    },
    async deleteNote(notePath: string): Promise<string> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-note", path: notePath }),
      });
      summary = projectFromResponse(response);
      return nextPathFromMutationResponse(response) ?? firstDocumentPath(this);
    },
    async deleteNoteFolder(folderPath: string): Promise<string> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-note-folder", folderPath }),
      });
      summary = projectFromResponse(response);
      return nextPathFromMutationResponse(response) ?? firstDocumentPath(this);
    },
    async moveNote(notePath: string, options: WorkspaceMoveNoteOptions): Promise<WorkspaceNote> {
      const response = await companionFetch(connection, "/api/project/mutation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "move-note",
          path: notePath,
          targetFolderPath: options.targetFolderPath,
        }),
      });
      summary = projectFromResponse(response);
      return noteFromMutationResponse(response);
    },
    resolveWikilink(_link: string, _fromPath?: string): WorkspaceLinkResolution {
      return { status: "unresolved" };
    },
  };
}

async function initializeNewProject(
  fileSystem: BrowserProjectFileSystem,
  title: string
): Promise<void> {
  const manifestStat = await fileSystem.stat("/claros.yaml");
  if (manifestStat.exists) {
    throw new Error("claros.yaml already exists");
  }

  await fileSystem.mkdir("/manuscript/001-draft", true);
  await fileSystem.mkdir("/notes", true);
  await fileSystem.writeFileAtomic(
    "/claros.yaml",
    `claros: 1\ntitle: ${yamlString(normalizedProjectTitle(title))}\n`
  );
  await fileSystem.writeFileAtomic("/manuscript/001-draft/chapter.yaml", "title: Draft\n");
  await fileSystem.writeFileAtomic(
    "/manuscript/001-draft/001-opening.md",
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

async function mutateCompanionProject(
  connection: CompanionConnection,
  body: Record<string, unknown>
): Promise<ProjectSummary> {
  const response = await companionFetch(connection, "/api/project/mutation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return projectFromResponse(response);
}

function sceneFromMutationResponse(response: unknown): WorkspaceScene {
  if (!isRecord(response) || !isRecord(response.scene)) {
    throw new Error("Companion response did not include a scene");
  }
  return normalizeWorkspaceScene(response.scene);
}

function chapterFromMutationResponse(response: unknown): WorkspaceChapter {
  if (!isRecord(response) || !isRecord(response.chapter)) {
    throw new Error("Companion response did not include a chapter");
  }
  return normalizeWorkspaceChapter(response.chapter);
}

function nextPathFromMutationResponse(response: unknown): string | undefined {
  if (!isRecord(response) || typeof response.nextPath !== "string") {
    return undefined;
  }
  return response.nextPath;
}

function moveResultFromMutationResponse(response: unknown): WorkspaceMoveResult {
  if (!isRecord(response)) {
    return { pathMap: {}, chapterIdMap: {} };
  }
  return {
    pathMap: stringRecord(response.pathMap),
    chapterIdMap: stringRecord(response.chapterIdMap),
  };
}

function noteFromMutationResponse(response: unknown): WorkspaceNote {
  if (!isRecord(response) || !isRecord(response.note)) {
    throw new Error("Companion response did not include a note");
  }
  return normalizeWorkspaceNote(response.note);
}

function noteFolderFromMutationResponse(response: unknown): WorkspaceNoteFolder {
  if (!isRecord(response) || !isRecord(response.noteFolder)) {
    throw new Error("Companion response did not include a note folder");
  }
  return normalizeWorkspaceNoteFolder(response.noteFolder);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
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
    noteFolders: Array.isArray(value.noteFolders)
      ? value.noteFolders.map(normalizeWorkspaceNoteFolder)
      : [],
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

function normalizeWorkspaceNoteFolder(value: unknown): WorkspaceNoteFolder {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.path !== "string") {
    throw new Error("Companion returned an invalid note folder");
  }
  return {
    kind: "note-folder",
    id: value.id,
    path: value.path,
    title: typeof value.title === "string" ? value.title : titleFromSlug(value.id),
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

function normalizedProjectTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Project";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
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

function toWorkspaceNoteFolder(folder: NoteFolderRef): WorkspaceNoteFolder {
  return {
    kind: "note-folder",
    id: folder.path,
    path: folder.path,
    title: titleFromSlug(folder.name),
    folderPath: [...folder.folderPath],
  };
}

function listProjectNoteFolders(project: ClarosProject): NoteFolderRef[] {
  if ("listNoteFolders" in project && typeof project.listNoteFolders === "function") {
    return project.listNoteFolders();
  }
  const folders = new Map<string, NoteFolderRef>();
  for (const note of project.listNotes()) {
    const parts = note.path.startsWith("notes/")
      ? note.path.slice("notes/".length).split("/").slice(0, -1)
      : [];
    for (let index = 0; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index + 1);
      const path = `notes/${folderPath.join("/")}`;
      folders.set(path, {
        kind: "note-folder",
        path,
        name: folderPath.at(-1) ?? "",
        folderPath,
      });
    }
  }
  return [...folders.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function toWorkspaceLinkResolution(resolution: LinkResolution): WorkspaceLinkResolution {
  if (resolution.status === "resolved") {
    return { status: "resolved", path: resolution.path, reason: resolution.reason };
  }
  if (resolution.status === "ambiguous") {
    return {
      status: "ambiguous",
      reason: resolution.reason,
      candidates: resolution.candidates.map(toWorkspaceNote),
    };
  }
  return { status: "unresolved" };
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

  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(raw);
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
    noteFolders: summary.noteFolders.map((folder) => ({
      ...folder,
      folderPath: [...folder.folderPath],
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
