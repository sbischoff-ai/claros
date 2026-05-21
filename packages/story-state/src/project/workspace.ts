import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  scanProjectFormat,
  parseMarkdownDocument,
  parseStateFile,
  serializeStateFile,
  setAtPath,
  type ChapterRef,
  type ClarosBlockRef,
  type MarkdownDocument,
  type NoteRef,
  type ProjectFileReader,
  type ProjectFileWriter,
  type ProjectManifest,
  type SceneRef,
  type SourceRange,
  type WikilinkRef,
} from "@claros/story-format";
import {
  createRegistry,
  loadModuleFromDirectory,
  type RNG,
  type UserPromptFn,
} from "@claros/emergence-engine";
import {
  getNoteFrontmatterPath,
  setNoteFrontmatterPath,
  type NoteFrontmatterIOOptions,
} from "../entity/state.js";
import { executeMacroInDocument as executeMacroInDocumentLowLevel } from "../runs/document.js";
import {
  getMacroRun as getMacroRunFromLedger,
  listMacroRuns as listMacroRunsFromLedger,
} from "../runs/ledger.js";
import type {
  DocumentInsertionPoint,
  ExecuteMacroInDocumentResult,
  MacroRunFilter,
  MacroRunLedgerEntry,
} from "../runs/types.js";
import { FileStateAdapter } from "../state/adapter.js";
import {
  createInMemoryProjectIndex,
  type ProjectIndex,
  type ProjectIndexSearchOptions,
  type ProjectIndexSearchResult,
  type WikilinkResolution,
} from "./index.js";
import {
  NodeProjectFileReader,
  NodeProjectFileWriter,
  ensureParentDirectory,
  normalizeProjectRoot,
  toAbsoluteProjectPath,
  toRelativeProjectPath,
} from "./files.js";
import { ProjectMutationEngine, StructuralMutationError } from "./mutations.js";

export type DocumentRef = SceneRef | NoteRef | { path: string };
export type LinkResolution = WikilinkResolution;
export type LinkRef = WikilinkRef;
export type SearchOptions = ProjectIndexSearchOptions;
export type SearchResult = ProjectIndexSearchResult;

export type MutationKind =
  | "document-write"
  | "frontmatter-path"
  | "state-path"
  | "metadata"
  | "structural";

export interface MutationResult {
  kind: MutationKind;
  changedPaths: string[];
  affectedPaths?: string[];
  pathMap?: Record<string, string>;
  chapterIdMap?: Record<string, string>;
  warnings?: MutationWarning[];
  linkRewrite?: LinkRewritePlan;
  /** True only when the call updated an owned in-memory project index. */
  indexUpdated: boolean;
}

export interface WriteDocumentOptions {
  refreshIndex?: boolean;
}

export interface SetFrontmatterPathOptions {
  refreshIndex?: boolean;
}

export interface RenameNoteOptions {
  rewriteLinks?: boolean;
  dryRun?: boolean;
}

export interface RenameSceneOptions {
  rewriteLinks?: boolean;
  dryRun?: boolean;
}

export type ManuscriptInsertionPlacement = "append" | "before" | "after";

export interface CreateSceneOptions {
  placement?: ManuscriptInsertionPlacement;
  targetScene?: SceneRef | string;
}

export interface CreateChapterOptions {
  placement?: ManuscriptInsertionPlacement;
  targetChapter?: ChapterRef | string;
}

export interface MoveChapterOptions {
  placement: Exclude<ManuscriptInsertionPlacement, "append">;
  targetChapter: ChapterRef | string;
}

export interface MoveSceneOptions {
  placement: ManuscriptInsertionPlacement;
  targetScene?: SceneRef | string;
  targetChapter?: ChapterRef | string;
}

export interface ManuscriptMoveResult {
  result: MutationResult;
  pathMap: Record<string, string>;
  chapterIdMap: Record<string, string>;
}

export interface StructuralMutationPlan {
  operation: "rename-scene" | "rename-note" | "move-note" | "reorder-scene" | "delete-document";
  affectedPaths: string[];
  /** Source document path for rename-like operations; useful for checkpoint context. */
  currentPath?: string;
  /** Target document path for rename-like operations; useful for checkpoint context. */
  targetPath?: string;
  linkRewrite?: LinkRewritePlan;
  warnings: MutationWarning[];
}

export interface MutationWarning {
  code: string;
  message: string;
  path?: string;
}

export interface LinkRewritePlan {
  rewrites: LinkRewrite[];
  ambiguousLinks: LinkRef[];
  unresolvedLinks: LinkRef[];
}

export interface LinkRewrite {
  path: string;
  range: SourceRange;
  from: string;
  to: string;
}

export { StructuralMutationError };

export interface CheckpointStatus {
  dirty: boolean;
  changedPaths: string[];
  currentTimeline: string;
  head?: string;
}

export interface CheckpointOptions {
  trigger?:
    | "manual"
    | "scene-transition"
    | "chapter-transition"
    | "session-end"
    | "pre-restore"
    | "pre-structural-change";
}

export interface RestoreCheckpointOptions {
  mode?: "new-timeline";
  name?: string;
}

export interface HistoryOptions {
  limit?: number;
}

export interface CheckpointRef {
  id: string;
  message?: string;
  createdAt?: string;
  trigger?: CheckpointOptions["trigger"];
}

export interface TimelineRef {
  id: string;
  name?: string;
}

export interface OpenProjectOptions {
  fileReader?: ProjectFileReader;
  fileWriter?: ProjectFileWriter;
}

export interface ProjectExecuteMacroInDocumentOptions {
  document: DocumentRef;
  macroId: string;
  params?: Record<string, unknown>;
  insertAt?: DocumentInsertionPoint;
  userPrompt?: UserPromptFn;
  rng?: RNG;
  now?: Date;
}

export interface ClarosProject {
  readonly root: string;
  readonly manifest: ProjectManifest;

  listChapters(): ChapterRef[];
  listScenes(): SceneRef[];
  listNotes(): NoteRef[];

  readDocument(ref: DocumentRef): Promise<MarkdownDocument>;
  writeDocument(
    ref: DocumentRef,
    document: MarkdownDocument | string,
    options?: WriteDocumentOptions
  ): Promise<MutationResult>;

  getStoryState(statePath: string): Promise<unknown>;
  setStoryState(statePath: string, value: unknown): Promise<MutationResult>;
  getSceneState(sceneId: string, statePath: string): Promise<unknown>;
  setSceneState(sceneId: string, statePath: string, value: unknown): Promise<MutationResult>;
  getChapterState(chapterId: string, statePath: string): Promise<unknown>;
  setChapterState(chapterId: string, statePath: string, value: unknown): Promise<MutationResult>;

  getNoteFrontmatterPath(note: NoteRef | string, frontmatterPath: string): Promise<unknown>;
  setNoteFrontmatterPath(
    note: NoteRef | string,
    frontmatterPath: string,
    value: unknown,
    options?: SetFrontmatterPathOptions
  ): Promise<MutationResult>;
  setProjectMetadataPath(metadataPath: string, value: unknown): Promise<MutationResult>;
  setChapterMetadataPath(
    chapterId: string,
    metadataPath: string,
    value: unknown
  ): Promise<MutationResult>;
  setProjectTitle(title: string): Promise<MutationResult>;
  setChapterTitle(chapterId: string, title: string): Promise<MutationResult>;
  setSceneTitle(scene: SceneRef | string, title: string): Promise<MutationResult>;
  appendChapter(
    chapterTitle: string,
    sceneTitle?: string
  ): Promise<{ result: MutationResult; scene: SceneRef }>;
  appendScene(title: string): Promise<{ result: MutationResult; scene: SceneRef }>;
  createChapter(
    chapterTitle: string,
    sceneTitle?: string,
    options?: CreateChapterOptions
  ): Promise<{ result: MutationResult; scene: SceneRef }>;
  createScene(
    title: string,
    options?: CreateSceneOptions
  ): Promise<{ result: MutationResult; scene: SceneRef }>;
  deleteChapter(chapterId: string): Promise<{ result: MutationResult; nextScene?: SceneRef }>;
  deleteScene(scene: SceneRef | string): Promise<{ result: MutationResult; nextScene?: SceneRef }>;
  moveChapter(
    chapter: ChapterRef | string,
    options: MoveChapterOptions
  ): Promise<ManuscriptMoveResult & { chapter: ChapterRef }>;
  moveScene(
    scene: SceneRef | string,
    options: MoveSceneOptions
  ): Promise<ManuscriptMoveResult & { scene: SceneRef }>;

  planRenameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: RenameNoteOptions
  ): Promise<StructuralMutationPlan>;
  renameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: RenameNoteOptions
  ): Promise<MutationResult>;
  planRenameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: RenameSceneOptions
  ): Promise<StructuralMutationPlan>;
  renameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: RenameSceneOptions
  ): Promise<MutationResult>;

  resolveWikilink(link: string, from?: DocumentRef): LinkResolution;
  getBacklinks(ref: DocumentRef): LinkRef[];
  search(query: string, options?: SearchOptions): SearchResult[];

  listClarosBlocks(ref?: DocumentRef): ClarosBlockRef[];
  executeMacroInDocument(
    options: ProjectExecuteMacroInDocumentOptions
  ): Promise<ExecuteMacroInDocumentResult>;
  listMacroRuns(filter?: MacroRunFilter): Promise<MacroRunLedgerEntry[]>;
  getMacroRun(id: string): Promise<MacroRunLedgerEntry | undefined>;

  checkpoint(message?: string, options?: CheckpointOptions): Promise<CheckpointRef>;
  getCheckpointStatus(): Promise<CheckpointStatus>;
  listCheckpoints(options?: HistoryOptions): Promise<CheckpointRef[]>;
  restoreCheckpoint(id: string, options?: RestoreCheckpointOptions): Promise<TimelineRef>;
}

export class CheckpointNotImplementedError extends Error {
  constructor(action: string) {
    super(`${action} is not implemented until Iter 14`);
    this.name = "CheckpointNotImplementedError";
  }
}

export async function openProject(
  root: string,
  options?: OpenProjectOptions
): Promise<ClarosProject> {
  const normalizedRoot = normalizeProjectRoot(root);
  const fileReader = options?.fileReader ?? new NodeProjectFileReader();
  const fileWriter = options?.fileWriter ?? new NodeProjectFileWriter();
  const snapshot = await scanProjectFormat(normalizedRoot, fileReader);
  const runs = await listMacroRunsFromLedger(normalizedRoot);
  const index = createInMemoryProjectIndex();
  await index.build(snapshot, runs);

  return new ClarosProjectImpl(normalizedRoot, snapshot.manifest, fileReader, fileWriter, index);
}

export async function listChapters(
  projectRoot: string,
  options?: OpenProjectOptions
): Promise<ChapterRef[]> {
  return (await openProject(projectRoot, options)).listChapters();
}

export async function listScenes(
  projectRoot: string,
  options?: OpenProjectOptions
): Promise<SceneRef[]> {
  return (await openProject(projectRoot, options)).listScenes();
}

export async function listNotes(
  projectRoot: string,
  options?: OpenProjectOptions
): Promise<NoteRef[]> {
  return (await openProject(projectRoot, options)).listNotes();
}

export async function readDocument(
  projectRoot: string,
  ref: DocumentRef,
  options?: OpenProjectOptions
): Promise<MarkdownDocument> {
  const fileReader = options?.fileReader ?? new NodeProjectFileReader();
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const relativePath = resolveDocumentPath(normalizedRoot, ref);
  const absolutePath = toAbsoluteProjectPath(normalizedRoot, relativePath);
  const raw = await fileReader.readFile(absolutePath);
  return parseMarkdownDocument(relativePath, raw);
}

export async function writeDocument(
  projectRoot: string,
  ref: DocumentRef,
  document: MarkdownDocument | string,
  options?: OpenProjectOptions & WriteDocumentOptions
): Promise<MutationResult> {
  const fileWriter = options?.fileWriter ?? new NodeProjectFileWriter();
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const relativePath = resolveDocumentPath(normalizedRoot, ref);
  const absolutePath = toAbsoluteProjectPath(normalizedRoot, relativePath);
  const raw = typeof document === "string" ? document : document.raw;
  await ensureParentDirectory(absolutePath, fileWriter);
  await fileWriter.writeFileAtomic(absolutePath, raw);
  return {
    kind: "document-write",
    changedPaths: [relativePath],
    indexUpdated: false,
  };
}

export async function getStoryState(projectRoot: string, statePath: string): Promise<unknown> {
  return new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).getStory(
    statePath
  );
}

export async function setStoryState(
  projectRoot: string,
  statePath: string,
  value: unknown,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const changedPath = "state/story.yaml";
  await setYamlPath(normalizedRoot, changedPath, statePath, value, options);
  return { kind: "state-path", changedPaths: [changedPath], indexUpdated: false };
}

export async function getSceneState(
  projectRoot: string,
  sceneId: string,
  statePath: string
): Promise<unknown> {
  return new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).getScene(
    sceneId,
    statePath
  );
}

export async function setSceneState(
  projectRoot: string,
  sceneId: string,
  statePath: string,
  value: unknown,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const changedPath = normalizeProjectRelativePath(`state/scenes/${sceneId}.yaml`);
  await setYamlPath(normalizedRoot, changedPath, statePath, value, options);
  return { kind: "state-path", changedPaths: [changedPath], indexUpdated: false };
}

export async function getChapterState(
  projectRoot: string,
  chapterId: string,
  statePath: string
): Promise<unknown> {
  return new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).getChapter(
    chapterId,
    statePath
  );
}

export async function setChapterState(
  projectRoot: string,
  chapterId: string,
  statePath: string,
  value: unknown,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const changedPath = normalizeProjectRelativePath(`state/chapters/${chapterId}.yaml`);
  await setYamlPath(normalizedRoot, changedPath, statePath, value, options);
  return { kind: "state-path", changedPaths: [changedPath], indexUpdated: false };
}

export async function getProjectNoteFrontmatterPath(
  projectRoot: string,
  note: NoteRef | string,
  frontmatterPath: string,
  options?: OpenProjectOptions & NoteFrontmatterIOOptions
): Promise<unknown> {
  return getNoteFrontmatterPath(resolveNoteReference(note), projectRoot, frontmatterPath, options);
}

export async function setProjectNoteFrontmatterPath(
  projectRoot: string,
  note: NoteRef | string,
  frontmatterPath: string,
  value: unknown,
  options?: OpenProjectOptions & NoteFrontmatterIOOptions & SetFrontmatterPathOptions
): Promise<MutationResult> {
  await setNoteFrontmatterPath(
    resolveNoteReference(note),
    projectRoot,
    frontmatterPath,
    value,
    options
  );
  return {
    kind: "frontmatter-path",
    changedPaths: [resolveNoteReference(note)],
    indexUpdated: false,
  };
}

export async function setProjectMetadataPath(
  projectRoot: string,
  metadataPath: string,
  value: unknown,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const changedPath = "claros.yaml";
  await setYamlPath(normalizeProjectRoot(projectRoot), changedPath, metadataPath, value, options);
  return { kind: "metadata", changedPaths: [changedPath], indexUpdated: false };
}

export async function setChapterMetadataPath(
  projectRoot: string,
  chapterId: string,
  metadataPath: string,
  value: unknown,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const changedPath = normalizeProjectRelativePath(`manuscript/${chapterId}/chapter.yaml`);
  await setYamlPath(normalizeProjectRoot(projectRoot), changedPath, metadataPath, value, options);
  return { kind: "metadata", changedPaths: [changedPath], indexUpdated: false };
}

export async function setProjectTitle(
  projectRoot: string,
  title: string,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  return setProjectMetadataPath(projectRoot, "title", normalizedProjectTitle(title), options);
}

export async function setChapterTitle(
  projectRoot: string,
  chapterId: string,
  title: string,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const changedPath = normalizeProjectRelativePath(`manuscript/${chapterId}/chapter.yaml`);
  await updateYamlObject(
    normalizedRoot,
    changedPath,
    (metadata) => withOptionalTitle(metadata, title),
    options
  );
  return { kind: "metadata", changedPaths: [changedPath], indexUpdated: false };
}

export async function setSceneTitle(
  projectRoot: string,
  scene: SceneRef | string,
  title: string,
  options?: OpenProjectOptions
): Promise<MutationResult> {
  const project = await openProject(projectRoot, options);
  return project.setSceneTitle(scene, title);
}

export async function appendChapter(
  projectRoot: string,
  chapterTitle: string,
  sceneTitle?: string,
  options?: OpenProjectOptions
): Promise<{ result: MutationResult; scene: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.appendChapter(chapterTitle, sceneTitle);
}

export async function appendScene(
  projectRoot: string,
  title: string,
  options?: OpenProjectOptions
): Promise<{ result: MutationResult; scene: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.appendScene(title);
}

export async function createChapter(
  projectRoot: string,
  chapterTitle: string,
  sceneTitle?: string,
  createOptions?: CreateChapterOptions,
  options?: OpenProjectOptions
): Promise<{ result: MutationResult; scene: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.createChapter(chapterTitle, sceneTitle, createOptions);
}

export async function createScene(
  projectRoot: string,
  title: string,
  createOptions?: CreateSceneOptions,
  options?: OpenProjectOptions
): Promise<{ result: MutationResult; scene: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.createScene(title, createOptions);
}

export async function deleteChapter(
  projectRoot: string,
  chapterId: string,
  options?: OpenProjectOptions
): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.deleteChapter(chapterId);
}

export async function deleteScene(
  projectRoot: string,
  scene: SceneRef | string,
  options?: OpenProjectOptions
): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.deleteScene(scene);
}

export async function moveChapter(
  projectRoot: string,
  chapter: ChapterRef | string,
  moveOptions: MoveChapterOptions,
  options?: OpenProjectOptions
): Promise<ManuscriptMoveResult & { chapter: ChapterRef }> {
  const project = await openProject(projectRoot, options);
  return project.moveChapter(chapter, moveOptions);
}

export async function moveScene(
  projectRoot: string,
  scene: SceneRef | string,
  moveOptions: MoveSceneOptions,
  options?: OpenProjectOptions
): Promise<ManuscriptMoveResult & { scene: SceneRef }> {
  const project = await openProject(projectRoot, options);
  return project.moveScene(scene, moveOptions);
}

export async function resolveWikilink(
  projectRoot: string,
  link: string,
  from?: DocumentRef,
  options?: OpenProjectOptions
): Promise<LinkResolution> {
  return (await openProject(projectRoot, options)).resolveWikilink(link, from);
}

export async function getBacklinks(
  projectRoot: string,
  ref: DocumentRef,
  options?: OpenProjectOptions
): Promise<LinkRef[]> {
  return (await openProject(projectRoot, options)).getBacklinks(ref);
}

export async function search(
  projectRoot: string,
  query: string,
  searchOptions?: SearchOptions,
  options?: OpenProjectOptions
): Promise<SearchResult[]> {
  return (await openProject(projectRoot, options)).search(query, searchOptions);
}

export async function listClarosBlocks(
  projectRoot: string,
  ref?: DocumentRef,
  options?: OpenProjectOptions
): Promise<ClarosBlockRef[]> {
  return (await openProject(projectRoot, options)).listClarosBlocks(ref);
}

export async function executeProjectMacroInDocument(
  projectRoot: string,
  options: ProjectExecuteMacroInDocumentOptions,
  openOptions?: OpenProjectOptions
): Promise<ExecuteMacroInDocumentResult> {
  return (await openProject(projectRoot, openOptions)).executeMacroInDocument(options);
}

export async function listProjectMacroRuns(
  projectRoot: string,
  filter?: MacroRunFilter,
  options?: OpenProjectOptions
): Promise<MacroRunLedgerEntry[]> {
  return (await openProject(projectRoot, options)).listMacroRuns(filter);
}

export async function getProjectMacroRun(
  projectRoot: string,
  id: string,
  options?: OpenProjectOptions
): Promise<MacroRunLedgerEntry | undefined> {
  return (await openProject(projectRoot, options)).getMacroRun(id);
}

export async function getCheckpointStatus(_projectRoot?: string): Promise<CheckpointStatus> {
  return {
    dirty: false,
    changedPaths: [],
    currentTimeline: "working",
  };
}

export async function listCheckpoints(
  _projectRoot?: string,
  _options?: HistoryOptions
): Promise<CheckpointRef[]> {
  return [];
}

export async function checkpoint(
  _projectRoot: string,
  _message?: string,
  _options?: CheckpointOptions
): Promise<CheckpointRef> {
  throw new CheckpointNotImplementedError("checkpoint");
}

export async function restoreCheckpoint(
  _projectRoot: string,
  _id: string,
  _options?: RestoreCheckpointOptions
): Promise<TimelineRef> {
  throw new CheckpointNotImplementedError("restoreCheckpoint");
}

class ClarosProjectImpl implements ClarosProject {
  private readonly stateAdapter: FileStateAdapter;
  private readonly mutations: ProjectMutationEngine;
  private registryPromise: Promise<ReturnType<typeof createRegistry>> | undefined;

  constructor(
    public readonly root: string,
    public readonly manifest: ProjectManifest,
    private readonly fileReader: ProjectFileReader,
    private readonly fileWriter: ProjectFileWriter,
    private readonly index: ProjectIndex
  ) {
    this.stateAdapter = new FileStateAdapter({ projectRoot: root });
    this.mutations = new ProjectMutationEngine({
      fileReader,
      fileWriter,
      index,
      toStoragePath: (relativePath) => toAbsoluteProjectPath(this.root, relativePath),
      rebuildIndex: () => this.rebuildIndex(),
    });
  }

  listChapters(): ChapterRef[] {
    return this.index.listChapters();
  }

  listScenes(): SceneRef[] {
    return this.index.listScenes();
  }

  listNotes(): NoteRef[] {
    return this.index.listNotes();
  }

  readDocument(ref: DocumentRef): Promise<MarkdownDocument> {
    return readDocument(this.root, ref, this.fileOptions());
  }

  async writeDocument(
    ref: DocumentRef,
    document: MarkdownDocument | string,
    options?: WriteDocumentOptions
  ): Promise<MutationResult> {
    const result = await writeDocument(this.root, ref, document, this.fileOptions());
    if (options?.refreshIndex ?? true) {
      await this.refreshDocument(ref);
      return { ...result, indexUpdated: true };
    }
    return result;
  }

  async getStoryState(statePath: string): Promise<unknown> {
    return this.stateAdapter.getStory(statePath);
  }

  async setStoryState(statePath: string, value: unknown): Promise<MutationResult> {
    const result = await setStoryState(this.root, statePath, value, this.fileOptions());
    this.stateAdapter.clearCache();
    return result;
  }

  async getSceneState(sceneId: string, statePath: string): Promise<unknown> {
    return this.stateAdapter.getScene(sceneId, statePath);
  }

  async setSceneState(sceneId: string, statePath: string, value: unknown): Promise<MutationResult> {
    const result = await setSceneState(this.root, sceneId, statePath, value, this.fileOptions());
    this.stateAdapter.clearCache();
    return result;
  }

  async getChapterState(chapterId: string, statePath: string): Promise<unknown> {
    return this.stateAdapter.getChapter(chapterId, statePath);
  }

  async setChapterState(
    chapterId: string,
    statePath: string,
    value: unknown
  ): Promise<MutationResult> {
    const result = await setChapterState(
      this.root,
      chapterId,
      statePath,
      value,
      this.fileOptions()
    );
    this.stateAdapter.clearCache();
    return result;
  }

  getNoteFrontmatterPath(note: NoteRef | string, frontmatterPath: string): Promise<unknown> {
    return getNoteFrontmatterPath(
      resolveNoteReference(note),
      this.root,
      frontmatterPath,
      this.fileOptions()
    );
  }

  async setNoteFrontmatterPath(
    note: NoteRef | string,
    frontmatterPath: string,
    value: unknown,
    options?: SetFrontmatterPathOptions
  ): Promise<MutationResult> {
    const notePath = resolveNoteReference(note);
    await setNoteFrontmatterPath(notePath, this.root, frontmatterPath, value, this.fileOptions());
    if (options?.refreshIndex ?? true) {
      await this.refreshDocument(notePath);
      return {
        kind: "frontmatter-path",
        changedPaths: [notePath],
        indexUpdated: true,
      };
    }
    return {
      kind: "frontmatter-path",
      changedPaths: [notePath],
      indexUpdated: false,
    };
  }

  async setProjectMetadataPath(metadataPath: string, value: unknown): Promise<MutationResult> {
    const changedPath = "claros.yaml";
    await setYamlPath(this.root, changedPath, metadataPath, value, this.fileOptions());
    await this.rebuildIndex();
    return { kind: "metadata", changedPaths: [changedPath], indexUpdated: true };
  }

  async setChapterMetadataPath(
    chapterId: string,
    metadataPath: string,
    value: unknown
  ): Promise<MutationResult> {
    const changedPath = normalizeProjectRelativePath(`manuscript/${chapterId}/chapter.yaml`);
    await setYamlPath(this.root, changedPath, metadataPath, value, this.fileOptions());
    await this.rebuildIndex();
    return { kind: "metadata", changedPaths: [changedPath], indexUpdated: true };
  }

  async setProjectTitle(title: string): Promise<MutationResult> {
    await updateYamlObject(
      this.root,
      "claros.yaml",
      (metadata) => ({
        ...metadata,
        title: normalizedProjectTitle(title),
      }),
      this.fileOptions()
    );
    await this.rebuildIndex();
    return { kind: "metadata", changedPaths: ["claros.yaml"], indexUpdated: true };
  }

  async setChapterTitle(chapterId: string, title: string): Promise<MutationResult> {
    return (await this.mutations.setChapterTitle(chapterId, title)).result;
  }

  async setSceneTitle(scene: SceneRef | string, title: string): Promise<MutationResult> {
    return (await this.mutations.setSceneTitle(scene, title)).result;
  }

  async appendChapter(
    chapterTitle: string,
    sceneTitle = ""
  ): Promise<{ result: MutationResult; scene: SceneRef }> {
    return this.mutations.appendChapter(chapterTitle, sceneTitle);
  }

  async appendScene(title: string): Promise<{ result: MutationResult; scene: SceneRef }> {
    return this.mutations.appendScene(title);
  }

  async createChapter(
    chapterTitle: string,
    sceneTitle = "",
    options: CreateChapterOptions = {}
  ): Promise<{ result: MutationResult; scene: SceneRef }> {
    return this.mutations.createChapter(chapterTitle, sceneTitle, options);
  }

  async createScene(
    title: string,
    options: CreateSceneOptions = {}
  ): Promise<{ result: MutationResult; scene: SceneRef }> {
    return this.mutations.createScene(title, options);
  }

  async deleteChapter(
    chapterId: string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
    return this.mutations.deleteChapter(chapterId);
  }

  async deleteScene(
    scene: SceneRef | string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
    return this.mutations.deleteScene(scene);
  }

  async moveChapter(
    chapter: ChapterRef | string,
    options: MoveChapterOptions
  ): Promise<ManuscriptMoveResult & { chapter: ChapterRef }> {
    return this.mutations.moveChapter(chapter, options);
  }

  async moveScene(
    scene: SceneRef | string,
    options: MoveSceneOptions
  ): Promise<ManuscriptMoveResult & { scene: SceneRef }> {
    return this.mutations.moveScene(scene, options);
  }

  async planRenameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: RenameNoteOptions
  ): Promise<StructuralMutationPlan> {
    return this.mutations.planRenameNote(note, nextPath, options?.rewriteLinks ?? false);
  }

  async renameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: RenameNoteOptions
  ): Promise<MutationResult> {
    const plan = await this.planRenameNote(note, nextPath, options);
    if (options?.dryRun ?? false) {
      return { kind: "structural", changedPaths: [], indexUpdated: false };
    }
    return this.mutations.applyRenamePlan(plan);
  }

  async planRenameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: RenameSceneOptions
  ): Promise<StructuralMutationPlan> {
    return this.mutations.planRenameScene(scene, nextSlug, options?.rewriteLinks ?? false);
  }

  async renameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: RenameSceneOptions
  ): Promise<MutationResult> {
    const plan = await this.planRenameScene(scene, nextSlug, options);
    if (options?.dryRun ?? false) {
      return { kind: "structural", changedPaths: [], indexUpdated: false };
    }
    return this.mutations.applyRenamePlan(plan);
  }

  resolveWikilink(link: string, from?: DocumentRef): LinkResolution {
    return this.index.resolveWikilink(
      link,
      from === undefined ? undefined : { path: resolveDocumentPath(this.root, from) }
    );
  }

  getBacklinks(ref: DocumentRef): LinkRef[] {
    return this.index.getBacklinks({ path: resolveDocumentPath(this.root, ref) });
  }

  search(query: string, options?: SearchOptions): SearchResult[] {
    return this.index.search(query, options);
  }

  listClarosBlocks(ref?: DocumentRef): ClarosBlockRef[] {
    if (ref === undefined) {
      return this.index.listClarosBlocks();
    }

    const relativePath = resolveDocumentPath(this.root, ref);
    return this.index.listClarosBlocks().filter((block) => block.fromPath === relativePath);
  }

  async executeMacroInDocument(
    options: ProjectExecuteMacroInDocumentOptions
  ): Promise<ExecuteMacroInDocumentResult> {
    const registry = await this.getRegistry();
    const result = await executeMacroInDocumentLowLevel({
      projectRoot: this.root,
      registry,
      macroId: options.macroId,
      documentPath: resolveDocumentPath(this.root, options.document),
      params: options.params,
      insertAt: options.insertAt,
      userPrompt: options.userPrompt,
      rng: options.rng,
      now: options.now,
      fileReader: this.fileReader,
      fileWriter: this.fileWriter,
    });

    await this.refreshRuns();
    if (result.document !== undefined) {
      await this.index.updateDocument(result.document.path, result.document.raw);
    } else {
      await this.refreshDocument(options.document);
    }

    return result;
  }

  async listMacroRuns(filter?: MacroRunFilter): Promise<MacroRunLedgerEntry[]> {
    return this.index.listMacroRuns(filter);
  }

  async getMacroRun(id: string): Promise<MacroRunLedgerEntry | undefined> {
    return getMacroRunFromLedger(this.root, id);
  }

  checkpoint(message?: string, options?: CheckpointOptions): Promise<CheckpointRef> {
    return checkpoint(this.root, message, options);
  }

  getCheckpointStatus(): Promise<CheckpointStatus> {
    return getCheckpointStatus(this.root);
  }

  listCheckpoints(options?: HistoryOptions): Promise<CheckpointRef[]> {
    return listCheckpoints(this.root, options);
  }

  restoreCheckpoint(id: string, options?: RestoreCheckpointOptions): Promise<TimelineRef> {
    return restoreCheckpoint(this.root, id, options);
  }

  private async refreshDocument(ref: DocumentRef | string): Promise<void> {
    const document = await this.readDocument(typeof ref === "string" ? { path: ref } : ref);
    await this.index.updateDocument(document.path, document.raw);
  }

  private async refreshRuns(): Promise<void> {
    await this.index.updateRuns(await listMacroRunsFromLedger(this.root));
  }

  private async rebuildIndex(): Promise<void> {
    const snapshot = await scanProjectFormat(this.root, this.fileReader);
    const runs = await listMacroRunsFromLedger(this.root);
    await this.index.build(snapshot, runs);
  }

  private async getRegistry(): Promise<ReturnType<typeof createRegistry>> {
    this.registryPromise ??= loadProjectRegistry(this.root, this.manifest);
    return this.registryPromise;
  }

  private fileOptions(): OpenProjectOptions & NoteFrontmatterIOOptions {
    return {
      fileReader: this.fileReader,
      fileWriter: this.fileWriter,
    };
  }
}

async function loadProjectRegistry(root: string, manifest: ProjectManifest) {
  const registry = createRegistry();

  for (const directory of await resolveModuleDirectories(root, manifest.modules)) {
    await loadModuleFromDirectory(directory, registry);
  }

  return registry;
}

async function resolveModuleDirectories(root: string, modules: unknown): Promise<string[]> {
  const entries = extractModuleEntries(modules);
  const directories: string[] = [];

  for (const entry of entries) {
    const candidates = path.isAbsolute(entry)
      ? [entry]
      : [path.resolve(root, entry), path.resolve(root, "modules", entry)];

    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) {
          directories.push(candidate);
          break;
        }
      } catch {
        // ignore missing candidate
      }
    }
  }

  return directories;
}

function extractModuleEntries(modules: unknown): string[] {
  if (typeof modules === "string") {
    return [modules];
  }

  if (Array.isArray(modules)) {
    return modules.filter((entry): entry is string => typeof entry === "string");
  }

  if (!isRecord(modules)) {
    return [];
  }

  return Object.entries(modules).flatMap(([key, value]) => {
    if (typeof value === "string") {
      return value === "enabled" ? [key] : [value];
    }
    if (value === true) {
      return [key];
    }
    if (isRecord(value) && typeof value.path === "string") {
      return [value.path];
    }
    return [];
  });
}

function resolveDocumentPath(projectRoot: string, ref: DocumentRef): string {
  return toRelativeProjectPath(projectRoot, ref.path);
}

function resolveNoteReference(note: NoteRef | string): string {
  return typeof note === "string" ? note : note.path;
}

async function setYamlPath(
  projectRoot: string,
  relativePath: string,
  statePath: string,
  value: unknown,
  options?: OpenProjectOptions
): Promise<void> {
  const reader = options?.fileReader ?? new NodeProjectFileReader();
  const writer = options?.fileWriter ?? new NodeProjectFileWriter();
  const absolutePath = toAbsoluteProjectPath(projectRoot, relativePath);
  const stat = await reader.stat(absolutePath);
  const current = stat.exists ? parseStateFile(await reader.readFile(absolutePath)).data : {};
  const next = setAtPath(current, statePath, value);
  await ensureParentDirectory(absolutePath, writer);
  await writer.writeFileAtomic(absolutePath, serializeStateFile({ data: next }));
}

async function updateYamlObject(
  projectRoot: string,
  relativePath: string,
  update: (current: Record<string, unknown>) => Record<string, unknown>,
  options?: OpenProjectOptions
): Promise<void> {
  const reader = options?.fileReader ?? new NodeProjectFileReader();
  const writer = options?.fileWriter ?? new NodeProjectFileWriter();
  const absolutePath = toAbsoluteProjectPath(projectRoot, relativePath);
  const stat = await reader.stat(absolutePath);
  const current = stat.exists ? parseStateFile(await reader.readFile(absolutePath)).data : {};
  const next = update(current);
  await ensureParentDirectory(absolutePath, writer);
  await writer.writeFileAtomic(absolutePath, serializeStateFile({ data: next }));
}

function normalizedProjectTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Project";
}

function withOptionalTitle(
  metadata: Record<string, unknown>,
  title: string
): Record<string, unknown> {
  const next = { ...metadata };
  const normalized = title.trim();
  if (normalized.length > 0) {
    next.title = normalized;
  } else {
    delete next.title;
  }
  return next;
}

function normalizeProjectRelativePath(candidatePath: string): string {
  return path.normalize(candidatePath).replace(/\\/g, "/").replace(/^\/+/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
