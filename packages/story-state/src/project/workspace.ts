import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  scanProjectFormat,
  parseMarkdownDocument,
  parseNoteFrontmatter,
  parseStateFile,
  serializeNoteFrontmatter,
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

export class StructuralMutationError extends Error {
  constructor(
    message: string,
    public readonly completedPaths: string[],
    public readonly pendingPaths: string[],
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "StructuralMutationError";
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  declare cause?: unknown;
}

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
  private registryPromise: Promise<ReturnType<typeof createRegistry>> | undefined;

  constructor(
    public readonly root: string,
    public readonly manifest: ProjectManifest,
    private readonly fileReader: ProjectFileReader,
    private readonly fileWriter: ProjectFileWriter,
    private readonly index: ProjectIndex
  ) {
    this.stateAdapter = new FileStateAdapter({ projectRoot: root });
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
    return { kind: "metadata", changedPaths: [changedPath], indexUpdated: true };
  }

  async setChapterMetadataPath(
    chapterId: string,
    metadataPath: string,
    value: unknown
  ): Promise<MutationResult> {
    const changedPath = normalizeProjectRelativePath(`manuscript/${chapterId}/chapter.yaml`);
    await setYamlPath(this.root, changedPath, metadataPath, value, this.fileOptions());
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
    const current = this.resolveChapterForMutation(chapterId);
    const currentRaw = await readOptionalFile(
      this.root,
      `${current.path}/chapter.yaml`,
      this.fileReader
    );
    const nextRaw = serializeChapterYamlWithTitle(currentRaw, title);
    return this.rebuildManuscript(
      () => true,
      () => true,
      {
        chapter: (chapter) =>
          chapter.id === current.id
            ? { raw: nextRaw, slug: slugForTitle(title, "chapter", chapter.sequence) }
            : {},
      }
    );
  }

  async setSceneTitle(scene: SceneRef | string, title: string): Promise<MutationResult> {
    const current = this.resolveSceneForMutation(scene);
    const raw = await this.fileReader.readFile(toAbsoluteProjectPath(this.root, current.path));
    const nextRaw = setMarkdownTitle(raw, title);
    return this.rebuildManuscript(
      () => true,
      () => true,
      {
        scene: (candidate) =>
          candidate.path === current.path
            ? { raw: nextRaw, slug: slugForTitle(title, "scene", candidate.sequence) }
            : {},
      }
    );
  }

  async appendChapter(
    chapterTitle: string,
    sceneTitle = ""
  ): Promise<{ result: MutationResult; scene: SceneRef }> {
    const chapters = this.listChapters();
    const scenes = this.listScenes();
    const nextChapterSequence = nextSequence(chapters.map((chapter) => chapter.sequence));
    const nextSceneSequence = nextSequence(scenes.map((scene) => scene.sequence));
    const chapterId = this.uniqueChapterId(nextChapterSequence, chapterTitle);
    const scenePath = this.uniqueScenePath(chapterId, nextSceneSequence, sceneTitle);
    const changedPaths = [
      normalizeProjectRelativePath(`manuscript/${chapterId}`),
      normalizeProjectRelativePath(`manuscript/${chapterId}/chapter.yaml`),
      scenePath,
    ];

    await this.fileWriter.mkdir(toAbsoluteProjectPath(this.root, `manuscript/${chapterId}`), true);
    await this.fileWriter.writeFileAtomic(
      toAbsoluteProjectPath(this.root, `manuscript/${chapterId}/chapter.yaml`),
      serializeTitleYaml(chapterTitle)
    );
    await this.fileWriter.writeFileAtomic(
      toAbsoluteProjectPath(this.root, scenePath),
      serializeSceneMarkdown(sceneTitle)
    );
    await this.rebuildIndex();
    const scene = this.sceneByPath(scenePath);
    return {
      result: { kind: "structural", changedPaths, indexUpdated: true },
      scene,
    };
  }

  async appendScene(title: string): Promise<{ result: MutationResult; scene: SceneRef }> {
    const chapters = this.listChapters();
    if (chapters.length === 0) {
      return this.appendChapter("", title);
    }
    const lastChapter = chapters.at(-1);
    if (lastChapter === undefined) {
      return this.appendChapter("", title);
    }
    const nextSceneSequence = nextSequence(this.listScenes().map((scene) => scene.sequence));
    const scenePath = this.uniqueScenePath(lastChapter.id, nextSceneSequence, title);
    await this.fileWriter.writeFileAtomic(
      toAbsoluteProjectPath(this.root, scenePath),
      serializeSceneMarkdown(title)
    );
    await this.rebuildIndex();
    const scene = this.sceneByPath(scenePath);
    return {
      result: { kind: "structural", changedPaths: [scenePath], indexUpdated: true },
      scene,
    };
  }

  async createChapter(
    chapterTitle: string,
    sceneTitle = "",
    options: CreateChapterOptions = {}
  ): Promise<{ result: MutationResult; scene: SceneRef }> {
    if (options.placement === undefined || options.placement === "append") {
      return this.appendChapter(chapterTitle, sceneTitle);
    }
    if (options.targetChapter === undefined) {
      throw new Error("Cannot insert chapter without a target chapter");
    }

    const target = this.resolveChapterForMutation(options.targetChapter);
    const chapters = this.listChapters();
    const scenes = this.listScenes();
    const targetIndex = chapters.findIndex((chapter) => chapter.id === target.id);
    const insertedChapterSequence =
      options.placement === "before" ? targetIndex + 1 : targetIndex + 2;
    const insertedSceneSequence =
      scenes.filter((scene) => {
        const chapterIndex = chapters.findIndex((chapter) => chapter.id === scene.chapterId);
        return options.placement === "before"
          ? chapterIndex < targetIndex
          : chapterIndex <= targetIndex;
      }).length + 1;

    const result = await this.rebuildManuscript(
      () => true,
      () => true,
      {},
      {
        targetChapterId: target.id,
        placement: options.placement,
        chapterTitle,
        sceneTitle,
      }
    );
    const scene = this.listScenes().find(
      (candidate) => candidate.sequence === insertedSceneSequence
    );
    if (
      scene === undefined ||
      scene.chapterId !==
        `${sequencePrefix(insertedChapterSequence)}-${slugForTitle(chapterTitle, "chapter", insertedChapterSequence)}`
    ) {
      throw new Error("Inserted chapter scene not found after manuscript mutation");
    }
    return { result, scene };
  }

  async createScene(
    title: string,
    options: CreateSceneOptions = {}
  ): Promise<{ result: MutationResult; scene: SceneRef }> {
    if (options.placement === undefined || options.placement === "append") {
      return this.appendScene(title);
    }
    if (options.targetScene === undefined) {
      throw new Error("Cannot insert scene without a target scene");
    }

    const target = this.resolveSceneForMutation(options.targetScene);
    const scenes = this.listScenes();
    const targetIndex = scenes.findIndex((scene) => scene.path === target.path);
    const insertedSceneSequence =
      options.placement === "before" ? targetIndex + 1 : targetIndex + 2;
    const result = await this.rebuildManuscript(
      () => true,
      () => true,
      {},
      {
        targetScenePath: target.path,
        placement: options.placement,
        sceneTitle: title,
      }
    );
    const scene = this.listScenes().find(
      (candidate) => candidate.sequence === insertedSceneSequence
    );
    if (scene === undefined) {
      throw new Error("Inserted scene not found after manuscript mutation");
    }
    return { result, scene };
  }

  async deleteChapter(
    chapterId: string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
    const chapters = this.listChapters();
    const scenes = this.listScenes();
    if (chapters.length <= 1 || scenes.every((scene) => scene.chapterId === chapterId)) {
      throw new Error("Cannot delete the final remaining chapter");
    }
    const firstRemovedSceneIndex = scenes.findIndex((scene) => scene.chapterId === chapterId);
    const result = await this.rebuildManuscript((chapter) => chapter.id !== chapterId);
    return { result, nextScene: sceneAtNearestIndex(this.listScenes(), firstRemovedSceneIndex) };
  }

  async deleteScene(
    scene: SceneRef | string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
    const current = this.resolveSceneForMutation(scene);
    const scenes = this.listScenes();
    if (scenes.length <= 1) {
      throw new Error("Cannot delete the final remaining scene");
    }
    const sceneIndex = scenes.findIndex((candidate) => candidate.path === current.path);
    const sceneCountInChapter = scenes.filter(
      (candidate) => candidate.chapterId === current.chapterId
    ).length;
    const removeChapter = sceneCountInChapter === 1;
    const result = await this.rebuildManuscript(
      (chapter) => !removeChapter || chapter.id !== current.chapterId,
      (candidate) => candidate.path !== current.path
    );
    return { result, nextScene: sceneAtNearestIndex(this.listScenes(), sceneIndex) };
  }

  async moveChapter(
    chapter: ChapterRef | string,
    options: MoveChapterOptions
  ): Promise<ManuscriptMoveResult & { chapter: ChapterRef }> {
    const current = this.resolveChapterForMutation(chapter);
    const target = this.resolveChapterForMutation(options.targetChapter);
    const chapters = this.listChapters();
    const currentIndex = chapters.findIndex((candidate) => candidate.id === current.id);
    const targetIndex = chapters.findIndex((candidate) => candidate.id === target.id);
    if (currentIndex === -1 || targetIndex === -1) {
      throw new Error("Chapter not found for move");
    }
    const remaining = chapters.filter((candidate) => candidate.id !== current.id);
    const adjustedTargetIndex = remaining.findIndex((candidate) => candidate.id === target.id);
    const insertionIndex =
      options.placement === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
    if (currentIndex === insertionIndex) {
      return {
        result: { kind: "structural", changedPaths: [], indexUpdated: false },
        pathMap: {},
        chapterIdMap: {},
        chapter: current,
      };
    }

    const orderedChapters = [
      ...remaining.slice(0, insertionIndex),
      current,
      ...remaining.slice(insertionIndex),
    ];
    const move = await this.rebuildManuscriptOrder(orderedChapters, this.listScenes());
    const movedChapterId = move.chapterIdMap[current.id] ?? current.id;
    const movedChapter = this.resolveChapterForMutation(movedChapterId);
    return { ...move, chapter: movedChapter };
  }

  async moveScene(
    scene: SceneRef | string,
    options: MoveSceneOptions
  ): Promise<ManuscriptMoveResult & { scene: SceneRef }> {
    const current = this.resolveSceneForMutation(scene);
    const scenes = this.listScenes();
    const currentIndex = scenes.findIndex((candidate) => candidate.path === current.path);
    if (currentIndex === -1) {
      throw new Error("Scene not found for move");
    }

    const remaining = scenes.filter((candidate) => candidate.path !== current.path);
    let insertionIndex: number;
    let targetChapterId: string;
    if (options.placement === "append") {
      if (options.targetChapter === undefined) {
        throw new Error("Cannot append scene without a target chapter");
      }
      const targetChapter = this.resolveChapterForMutation(options.targetChapter);
      targetChapterId = targetChapter.id;
      insertionIndex = appendSceneIndexForChapter(remaining, this.listChapters(), targetChapter.id);
    } else {
      if (options.targetScene === undefined) {
        throw new Error("Cannot move scene without a target scene");
      }
      const target = this.resolveSceneForMutation(options.targetScene);
      if (target.path === current.path) {
        return {
          result: { kind: "structural", changedPaths: [], indexUpdated: false },
          pathMap: {},
          chapterIdMap: {},
          scene: current,
        };
      }
      const adjustedTargetIndex = remaining.findIndex(
        (candidate) => candidate.path === target.path
      );
      if (adjustedTargetIndex === -1) {
        throw new Error("Target scene not found for move");
      }
      insertionIndex =
        options.placement === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
      targetChapterId = target.chapterId;
    }

    if (targetChapterId === current.chapterId && currentIndex === insertionIndex) {
      return {
        result: { kind: "structural", changedPaths: [], indexUpdated: false },
        pathMap: {},
        chapterIdMap: {},
        scene: current,
      };
    }

    const orderedScenes = [
      ...remaining.slice(0, insertionIndex),
      { ...current, chapterId: targetChapterId },
      ...remaining.slice(insertionIndex),
    ];
    const removeSourceChapter =
      targetChapterId !== current.chapterId &&
      scenes.filter((candidate) => candidate.chapterId === current.chapterId).length === 1;
    const orderedChapters = this.listChapters().filter(
      (chapter) => !removeSourceChapter || chapter.id !== current.chapterId
    );
    const move = await this.rebuildManuscriptOrder(orderedChapters, orderedScenes);
    const movedScenePath = move.pathMap[current.path] ?? current.path;
    const movedScene = this.resolveSceneForMutation(movedScenePath);
    return { ...move, scene: movedScene };
  }

  async planRenameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: RenameNoteOptions
  ): Promise<StructuralMutationPlan> {
    const current = this.resolveNoteForMutation(note);
    const targetPath = normalizeNoteTargetPath(nextPath);
    return this.buildStructuralPlan("rename-note", current.path, targetPath, {
      rewriteLinks: options?.rewriteLinks ?? false,
    });
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
    return this.applyRenamePlan(plan);
  }

  async planRenameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: RenameSceneOptions
  ): Promise<StructuralMutationPlan> {
    const current = this.resolveSceneForMutation(scene);
    const targetPath = renameScenePath(current.path, nextSlug);
    return this.buildStructuralPlan("rename-scene", current.path, targetPath, {
      rewriteLinks: options?.rewriteLinks ?? false,
    });
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
    return this.applyRenamePlan(plan);
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

  private resolveNoteForMutation(note: NoteRef | string): NoteRef {
    if (typeof note !== "string") {
      return note;
    }

    const normalized = normalizeProjectRelativePath(note);
    const normalizedWithMarkdown = normalized.toLowerCase().endsWith(".md")
      ? normalized
      : `${normalized}.md`;
    const basename = path.basename(normalized, path.extname(normalized)).toLowerCase();
    const match = this.listNotes().find((candidate) => {
      const candidateBasename = path
        .basename(candidate.path, path.extname(candidate.path))
        .toLowerCase();
      return (
        candidate.path === normalized ||
        candidate.path === normalizedWithMarkdown ||
        candidate.path === `notes/${normalizedWithMarkdown}` ||
        candidateBasename === basename
      );
    });

    if (match === undefined) {
      throw new Error(`Note not found: ${note}`);
    }
    return match;
  }

  private resolveSceneForMutation(scene: SceneRef | string): SceneRef {
    if (typeof scene !== "string") {
      return scene;
    }

    const normalized = normalizeProjectRelativePath(scene);
    const match = this.listScenes().find(
      (candidate) => candidate.id === normalized || candidate.path === normalized
    );
    if (match === undefined) {
      throw new Error(`Scene not found: ${scene}`);
    }
    return match;
  }

  private resolveChapterForMutation(chapterId: ChapterRef | string): ChapterRef {
    if (typeof chapterId !== "string") {
      return chapterId;
    }

    const normalized = normalizeProjectRelativePath(chapterId);
    const match = this.listChapters().find(
      (candidate) => candidate.id === normalized || candidate.path === normalized
    );
    if (match === undefined) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
    return match;
  }

  private async buildStructuralPlan(
    operation: StructuralMutationPlan["operation"],
    currentPath: string,
    targetPath: string,
    options: { rewriteLinks: boolean }
  ): Promise<StructuralMutationPlan> {
    const affectedPaths = new Set<string>([currentPath, targetPath]);
    const warnings: MutationWarning[] = [];
    const targetStat = await this.fileReader.stat(toAbsoluteProjectPath(this.root, targetPath));
    if (targetStat.exists) {
      warnings.push({
        code: "target-exists",
        message: `Target path already exists: ${targetPath}`,
        path: targetPath,
      });
    }

    const linkRewrite = options.rewriteLinks
      ? this.planLinkRewrites(currentPath, targetPath)
      : undefined;
    for (const rewrite of linkRewrite?.rewrites ?? []) {
      affectedPaths.add(rewrite.path);
    }

    return {
      operation,
      affectedPaths: [...affectedPaths].sort(),
      currentPath,
      targetPath,
      linkRewrite,
      warnings,
    };
  }

  private planLinkRewrites(currentPath: string, targetPath: string): LinkRewritePlan {
    const rewrites: LinkRewrite[] = [];
    const ambiguousLinks: LinkRef[] = [];
    const unresolvedLinks: LinkRef[] = [];
    const documents = [...this.listScenes(), ...this.listNotes()];

    for (const document of documents) {
      for (const link of this.index.getOutgoingLinks({ path: document.path })) {
        const resolution = this.index.resolveWikilink(link.target, { path: link.fromPath });
        if (resolution.status === "resolved" && resolution.path === currentPath) {
          rewrites.push({
            path: link.fromPath,
            range: link.range,
            from: link.raw,
            to: renderPathQualifiedWikilink(targetPath, link.alias ?? link.target),
          });
        } else if (resolution.status === "ambiguous") {
          ambiguousLinks.push(link);
        } else if (resolution.status === "unresolved") {
          unresolvedLinks.push(link);
        }
      }
    }

    return { rewrites, ambiguousLinks, unresolvedLinks };
  }

  private async applyRenamePlan(plan: StructuralMutationPlan): Promise<MutationResult> {
    const [currentPath, targetPath] = inferRenamePaths(plan);
    const blockingWarning = plan.warnings.find((warning) => warning.code === "target-exists");
    if (blockingWarning !== undefined) {
      throw new Error(blockingWarning.message);
    }
    const completedPaths: string[] = [];
    const pendingPaths = new Set(plan.affectedPaths);

    try {
      await this.fileWriter.renameFile(
        toAbsoluteProjectPath(this.root, currentPath),
        toAbsoluteProjectPath(this.root, targetPath)
      );
      completedPaths.push(currentPath, targetPath);
      pendingPaths.delete(currentPath);
      pendingPaths.delete(targetPath);

      const rewritesByPath = groupLinkRewritesByPath(plan.linkRewrite?.rewrites ?? []);
      for (const [rewritePath, rewrites] of rewritesByPath.entries()) {
        const readPath = rewritePath === currentPath ? targetPath : rewritePath;
        const absolutePath = toAbsoluteProjectPath(this.root, readPath);
        const raw = await this.fileReader.readFile(absolutePath);
        const nextRaw = applyLinkRewrites(raw, rewrites);
        await this.fileWriter.writeFileAtomic(absolutePath, nextRaw);
        completedPaths.push(readPath);
        pendingPaths.delete(rewritePath);
        pendingPaths.delete(readPath);
      }
    } catch (error) {
      throw new StructuralMutationError(
        `Structural mutation failed for ${plan.operation}`,
        [...new Set(completedPaths)],
        [...pendingPaths],
        { cause: error }
      );
    }

    await this.index.removeDocument(currentPath);
    await this.refreshDocument(targetPath);
    for (const rewritePath of groupLinkRewritesByPath(plan.linkRewrite?.rewrites ?? []).keys()) {
      await this.refreshDocument(rewritePath === currentPath ? targetPath : rewritePath);
    }

    return {
      kind: "structural",
      changedPaths: [...new Set(completedPaths)].sort(),
      indexUpdated: true,
    };
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

  private sceneByPath(scenePath: string): SceneRef {
    const scene = this.listScenes().find((candidate) => candidate.path === scenePath);
    if (scene === undefined) {
      throw new Error(`Scene not found after manuscript mutation: ${scenePath}`);
    }
    return scene;
  }

  private uniqueChapterId(sequence: number, title: string): string {
    const prefix = sequencePrefix(sequence);
    const baseSlug = title.trim().length > 0 ? slugifyPathComponent(title) : `chapter-${sequence}`;
    const existing = new Set(this.listChapters().map((chapter) => chapter.id));
    return uniqueSequenceName(prefix, baseSlug, existing);
  }

  private uniqueScenePath(chapterId: string, sequence: number, title: string): string {
    const prefix = sequencePrefix(sequence);
    const baseSlug = title.trim().length > 0 ? slugifyPathComponent(title) : `scene-${sequence}`;
    const existing = new Set(
      this.listScenes().map((scene) => path.posix.basename(scene.path, ".md"))
    );
    const stem = uniqueSequenceName(prefix, baseSlug, existing);
    return normalizeProjectRelativePath(`manuscript/${chapterId}/${stem}.md`);
  }

  private async rebuildManuscript(
    keepChapter: (chapter: ChapterRef) => boolean,
    keepScene: (scene: SceneRef) => boolean = () => true,
    transform: ManuscriptRebuildTransform = {},
    insertion?: ManuscriptInsertion
  ): Promise<MutationResult> {
    const chapters = this.listChapters();
    const scenesByChapter = new Map<string, SceneRef[]>();
    for (const scene of this.listScenes().filter(keepScene)) {
      const scenes = scenesByChapter.get(scene.chapterId) ?? [];
      scenes.push(scene);
      scenesByChapter.set(scene.chapterId, scenes);
    }

    const rebuilt: RebuiltChapter[] = [];
    let nextChapterSequence = 1;
    let nextSceneSequence = 1;

    for (const chapter of chapters) {
      if (!keepChapter(chapter)) {
        continue;
      }
      if (insertion?.targetChapterId === chapter.id && insertion.placement === "before") {
        rebuilt.push(buildInsertedChapter(insertion, nextChapterSequence, nextSceneSequence));
        nextChapterSequence += 1;
        nextSceneSequence += 1;
      }
      const scenes = scenesByChapter.get(chapter.id) ?? [];
      if (scenes.length === 0) {
        continue;
      }
      const chapterTransform = transform.chapter?.(chapter, nextChapterSequence) ?? {};
      const chapterRaw =
        chapterTransform.raw ??
        (await readOptionalFile(this.root, `${chapter.path}/chapter.yaml`, this.fileReader));
      const nextChapterSlug =
        chapterTransform.slug ??
        resequenceDefaultSlug(chapter.slug, "chapter", nextChapterSequence);
      const nextChapterId = `${sequencePrefix(nextChapterSequence)}-${nextChapterSlug}`;
      const rebuiltScenes: RebuiltScene[] = [];
      for (const scene of scenes) {
        if (insertion?.targetScenePath === scene.path && insertion.placement === "before") {
          rebuiltScenes.push(
            buildInsertedScene(insertion.sceneTitle, nextChapterId, nextSceneSequence)
          );
          nextSceneSequence += 1;
        }
        const sceneTransform = transform.scene?.(scene, nextSceneSequence) ?? {};
        const raw =
          sceneTransform.raw ??
          (await this.fileReader.readFile(toAbsoluteProjectPath(this.root, scene.path)));
        const nextSceneSlug =
          sceneTransform.slug ?? resequenceDefaultSlug(scene.slug, "scene", nextSceneSequence);
        rebuiltScenes.push({
          path: normalizeProjectRelativePath(
            `manuscript/${nextChapterId}/${sequencePrefix(nextSceneSequence)}-${nextSceneSlug}.md`
          ),
          raw,
        });
        nextSceneSequence += 1;
        if (insertion?.targetScenePath === scene.path && insertion.placement === "after") {
          rebuiltScenes.push(
            buildInsertedScene(insertion.sceneTitle, nextChapterId, nextSceneSequence)
          );
          nextSceneSequence += 1;
        }
      }
      rebuilt.push({
        path: normalizeProjectRelativePath(`manuscript/${nextChapterId}`),
        chapterRaw,
        scenes: rebuiltScenes,
      });
      nextChapterSequence += 1;
      if (insertion?.targetChapterId === chapter.id && insertion.placement === "after") {
        rebuilt.push(buildInsertedChapter(insertion, nextChapterSequence, nextSceneSequence));
        nextChapterSequence += 1;
        nextSceneSequence += 1;
      }
    }

    await this.fileWriter.removeFile(toAbsoluteProjectPath(this.root, "manuscript"));
    await this.fileWriter.mkdir(toAbsoluteProjectPath(this.root, "manuscript"), true);
    const changedPaths = new Set<string>(["manuscript"]);
    for (const chapter of rebuilt) {
      await this.fileWriter.mkdir(toAbsoluteProjectPath(this.root, chapter.path), true);
      changedPaths.add(chapter.path);
      if (chapter.chapterRaw !== undefined) {
        const chapterMetadataPath = `${chapter.path}/chapter.yaml`;
        await this.fileWriter.writeFileAtomic(
          toAbsoluteProjectPath(this.root, chapterMetadataPath),
          chapter.chapterRaw
        );
        changedPaths.add(chapterMetadataPath);
      }
      for (const scene of chapter.scenes) {
        await this.fileWriter.writeFileAtomic(
          toAbsoluteProjectPath(this.root, scene.path),
          scene.raw
        );
        changedPaths.add(scene.path);
      }
    }
    await this.rebuildIndex();
    return { kind: "structural", changedPaths: [...changedPaths].sort(), indexUpdated: true };
  }

  private async rebuildManuscriptOrder(
    orderedChapters: ChapterRef[],
    orderedScenes: SceneRef[]
  ): Promise<ManuscriptMoveResult> {
    const scenesByChapter = new Map<string, SceneRef[]>();
    for (const scene of orderedScenes) {
      const scenes = scenesByChapter.get(scene.chapterId) ?? [];
      scenes.push(scene);
      scenesByChapter.set(scene.chapterId, scenes);
    }

    const rebuilt: RebuiltChapter[] = [];
    const chapterIdMap: Record<string, string> = {};
    const pathMap: Record<string, string> = {};
    let nextChapterSequence = 1;
    let nextSceneSequence = 1;

    for (const chapter of orderedChapters) {
      const chapterScenes = scenesByChapter.get(chapter.id) ?? [];
      if (chapterScenes.length === 0) {
        continue;
      }
      const chapterRaw = await readOptionalFile(
        this.root,
        `${chapter.path}/chapter.yaml`,
        this.fileReader
      );
      const nextChapterSlug = resequenceDefaultSlug(chapter.slug, "chapter", nextChapterSequence);
      const nextChapterId = `${sequencePrefix(nextChapterSequence)}-${nextChapterSlug}`;
      chapterIdMap[chapter.id] = nextChapterId;
      const rebuiltScenes: RebuiltScene[] = [];
      for (const scene of chapterScenes) {
        const raw = await this.fileReader.readFile(toAbsoluteProjectPath(this.root, scene.path));
        const nextSceneSlug = resequenceDefaultSlug(scene.slug, "scene", nextSceneSequence);
        const nextScenePath = normalizeProjectRelativePath(
          `manuscript/${nextChapterId}/${sequencePrefix(nextSceneSequence)}-${nextSceneSlug}.md`
        );
        pathMap[scene.path] = nextScenePath;
        rebuiltScenes.push({ path: nextScenePath, raw });
        nextSceneSequence += 1;
      }
      rebuilt.push({
        path: normalizeProjectRelativePath(`manuscript/${nextChapterId}`),
        chapterRaw,
        scenes: rebuiltScenes,
      });
      nextChapterSequence += 1;
    }

    await this.fileWriter.removeFile(toAbsoluteProjectPath(this.root, "manuscript"));
    await this.fileWriter.mkdir(toAbsoluteProjectPath(this.root, "manuscript"), true);
    const changedPaths = new Set<string>(["manuscript"]);
    for (const chapter of rebuilt) {
      await this.fileWriter.mkdir(toAbsoluteProjectPath(this.root, chapter.path), true);
      changedPaths.add(chapter.path);
      if (chapter.chapterRaw !== undefined) {
        const chapterMetadataPath = `${chapter.path}/chapter.yaml`;
        await this.fileWriter.writeFileAtomic(
          toAbsoluteProjectPath(this.root, chapterMetadataPath),
          chapter.chapterRaw
        );
        changedPaths.add(chapterMetadataPath);
      }
      for (const scene of chapter.scenes) {
        await this.fileWriter.writeFileAtomic(
          toAbsoluteProjectPath(this.root, scene.path),
          scene.raw
        );
        changedPaths.add(scene.path);
      }
    }
    await this.rebuildIndex();
    return {
      result: { kind: "structural", changedPaths: [...changedPaths].sort(), indexUpdated: true },
      pathMap,
      chapterIdMap,
    };
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

interface RebuiltScene {
  path: string;
  raw: string;
}

interface RebuiltChapter {
  path: string;
  chapterRaw?: string;
  scenes: RebuiltScene[];
}

interface ManuscriptRebuildTransform {
  chapter?: (chapter: ChapterRef, nextSequence: number) => { raw?: string; slug?: string };
  scene?: (scene: SceneRef, nextSequence: number) => { raw?: string; slug?: string };
}

interface ManuscriptInsertion {
  placement: "before" | "after";
  targetChapterId?: string;
  targetScenePath?: string;
  chapterTitle?: string;
  sceneTitle: string;
}

function buildInsertedChapter(
  insertion: ManuscriptInsertion,
  chapterSequence: number,
  sceneSequence: number
): RebuiltChapter {
  const chapterTitle = insertion.chapterTitle ?? "";
  const chapterId = `${sequencePrefix(chapterSequence)}-${slugForTitle(
    chapterTitle,
    "chapter",
    chapterSequence
  )}`;
  return {
    path: normalizeProjectRelativePath(`manuscript/${chapterId}`),
    chapterRaw: serializeTitleYaml(chapterTitle),
    scenes: [buildInsertedScene(insertion.sceneTitle, chapterId, sceneSequence)],
  };
}

function buildInsertedScene(title: string, chapterId: string, sceneSequence: number): RebuiltScene {
  const sceneSlug = slugForTitle(title, "scene", sceneSequence);
  return {
    path: normalizeProjectRelativePath(
      `manuscript/${chapterId}/${sequencePrefix(sceneSequence)}-${sceneSlug}.md`
    ),
    raw: serializeSceneMarkdown(title),
  };
}

async function readOptionalFile(
  projectRoot: string,
  relativePath: string,
  reader: ProjectFileReader
): Promise<string | undefined> {
  const absolutePath = toAbsoluteProjectPath(projectRoot, relativePath);
  const stat = await reader.stat(absolutePath);
  return stat.exists && !stat.isDirectory ? reader.readFile(absolutePath) : undefined;
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

function setMarkdownTitle(raw: string, title: string): string {
  const parsed = parseNoteFrontmatter(raw);
  const frontmatter = withOptionalTitle(parsed.frontmatter, title);
  if (Object.keys(frontmatter).length === 0) {
    return parsed.body;
  }
  return serializeNoteFrontmatter(frontmatter, parsed.body);
}

function serializeChapterYamlWithTitle(raw: string | undefined, title: string): string {
  const current = raw === undefined || raw.trim().length === 0 ? {} : parseStateFile(raw).data;
  const metadata = withOptionalTitle(isRecord(current) ? current : {}, title);
  return Object.keys(metadata).length === 0 ? "" : serializeStateFile({ data: metadata });
}

function serializeTitleYaml(title: string): string {
  const metadata = withOptionalTitle({}, title);
  return Object.keys(metadata).length === 0 ? "" : serializeStateFile({ data: metadata });
}

function serializeSceneMarkdown(title: string): string {
  const metadata = withOptionalTitle({}, title);
  return Object.keys(metadata).length === 0 ? "" : serializeNoteFrontmatter(metadata, "");
}

function nextSequence(sequences: number[]): number {
  return sequences.length === 0 ? 1 : Math.max(...sequences) + 1;
}

function sequencePrefix(sequence: number): string {
  return String(sequence).padStart(3, "0");
}

function uniqueSequenceName(prefix: string, slug: string, existing: Set<string>): string {
  let candidate = `${prefix}-${slug}`;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${prefix}-${slug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function resequenceDefaultSlug(slug: string, kind: "chapter" | "scene", sequence: number): string {
  return new RegExp(`^${kind}-\\d+$`).test(slug) ? `${kind}-${sequence}` : slug;
}

function slugForTitle(title: string, kind: "chapter" | "scene", sequence: number): string {
  const normalized = title.trim();
  return normalized.length > 0 ? slugifyPathComponent(normalized) : `${kind}-${sequence}`;
}

function sceneAtNearestIndex(scenes: SceneRef[], index: number): SceneRef | undefined {
  if (scenes.length === 0) {
    return undefined;
  }
  return scenes[Math.min(Math.max(index, 0), scenes.length - 1)];
}

function appendSceneIndexForChapter(
  scenes: SceneRef[],
  chapters: ChapterRef[],
  chapterId: string
): number {
  const targetChapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  if (targetChapterIndex === -1) {
    return scenes.length;
  }
  let index = 0;
  scenes.forEach((scene) => {
    const chapterIndex = chapters.findIndex((chapter) => chapter.id === scene.chapterId);
    if (chapterIndex <= targetChapterIndex) {
      index += 1;
    }
  });
  return index;
}

function normalizeProjectRelativePath(candidatePath: string): string {
  return path.normalize(candidatePath).replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeNoteTargetPath(candidatePath: string): string {
  const normalized = normalizeProjectRelativePath(candidatePath);
  const withDirectory = normalized.startsWith("notes/") ? normalized : `notes/${normalized}`;
  return withDirectory.toLowerCase().endsWith(".md") ? withDirectory : `${withDirectory}.md`;
}

function renameScenePath(currentPath: string, nextSlug: string): string {
  const normalizedSlug = slugifyPathComponent(nextSlug);
  const directory = path.posix.dirname(normalizeProjectRelativePath(currentPath));
  const basename = path.posix.basename(currentPath, ".md");
  const sequencePrefix = basename.match(/^(\d+)-/)?.[1];
  if (sequencePrefix === undefined) {
    throw new Error(`Scene path does not have a sequence-prefixed filename: ${currentPath}`);
  }
  return `${directory}/${sequencePrefix}-${normalizedSlug}.md`;
}

function slugifyPathComponent(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (slug.length === 0) {
    throw new Error("Slug must not be empty");
  }
  return slug;
}

function renderPathQualifiedWikilink(targetPath: string, displayText: string): string {
  const display = displayText.trim();
  return display.length === 0 ? `[[${targetPath}]]` : `[[${targetPath}|${display}]]`;
}

function groupLinkRewritesByPath(rewrites: LinkRewrite[]): Map<string, LinkRewrite[]> {
  const grouped = new Map<string, LinkRewrite[]>();
  for (const rewrite of rewrites) {
    const current = grouped.get(rewrite.path) ?? [];
    current.push(rewrite);
    grouped.set(rewrite.path, current);
  }
  return grouped;
}

function applyLinkRewrites(raw: string, rewrites: LinkRewrite[]): string {
  return [...rewrites]
    .sort((left, right) => right.range.start.offset - left.range.start.offset)
    .reduce(
      (current, rewrite) =>
        `${current.slice(0, rewrite.range.start.offset)}${rewrite.to}${current.slice(
          rewrite.range.end.offset
        )}`,
      raw
    );
}

function inferRenamePaths(plan: StructuralMutationPlan): [string, string] {
  if (plan.currentPath !== undefined && plan.targetPath !== undefined) {
    return [plan.currentPath, plan.targetPath];
  }
  throw new Error(`Structural plan is missing rename paths for ${plan.operation}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
