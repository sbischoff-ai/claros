import { dump, load } from "js-yaml";
import {
  getAtPath,
  parseMarkdownDocument,
  parseNoteFrontmatter,
  parseStateFile,
  scanProjectFormat,
  serializeNoteFrontmatter,
  serializeStateFile,
  setAtPath,
  type ChapterRef,
  type ClarosBlockRef,
  type MarkdownDocument,
  type NoteFolderRef,
  type NoteRef,
  type ProjectFileReader,
  type ProjectFileWriter,
  type ProjectManifest,
  type SceneRef,
} from "@claros/story-format/browser";
import { createInMemoryProjectIndex, type ProjectIndex } from "./project/index.js";
import type {
  CheckpointOptions,
  CheckpointRef,
  CheckpointStatus,
  ClarosProject,
  CreateChapterOptions,
  CreateSceneOptions,
  CreateNoteFolderOptions,
  CreateNoteOptions,
  DocumentRef,
  HistoryOptions,
  LinkRef,
  LinkResolution,
  ManuscriptMoveResult,
  MutationResult,
  MoveChapterOptions,
  MoveNoteOptions,
  MoveSceneOptions,
  ProjectExecuteMacroInDocumentOptions,
  RestoreCheckpointOptions,
  SearchOptions,
  SearchResult,
  SetFrontmatterPathOptions,
  StructuralMutationPlan,
  TimelineRef,
  WriteDocumentOptions,
} from "./project/workspace.js";
import { ProjectMutationEngine } from "./project/mutations.js";
import type {
  ExecuteMacroInDocumentResult,
  MacroRunDisplay,
  MacroRunEffect,
  MacroRunFilter,
  MacroRunLedgerEntry,
  MacroRunRoll,
} from "./runs/types.js";

export type {
  ChapterRef,
  ClarosBlockRef,
  MarkdownDocument,
  NoteRef,
  NoteFolderRef,
  ProjectDirEntry,
  ProjectFileReader,
  ProjectFileStat,
  ProjectFileWriter,
  ProjectManifest,
  SceneFrontmatter,
  SceneRef,
  SourceRange,
  WikilinkRef,
} from "@claros/story-format/browser";
export {
  extractWikilinks,
  replaceMarkdownBodyPreservingFrontmatter,
} from "@claros/story-format/browser";
export {
  ProjectAlreadyExistsError,
  initializeProjectFiles,
  normalizedProjectTitle,
} from "./project/initial-project.js";
export {
  summarizeWorkspaceProject,
  titleFromSlug,
  toWorkspaceChapter,
  toWorkspaceDocument,
  toWorkspaceLinkResolution,
  toWorkspaceManifest,
  toWorkspaceNote,
  toWorkspaceNoteFolder,
  toWorkspaceScene,
} from "./project/presentation.js";
export type {
  WorkspaceChapter,
  WorkspaceDocument,
  WorkspaceDocumentRef,
  WorkspaceLinkResolution,
  WorkspaceManifest,
  WorkspaceNote,
  WorkspaceNoteFolder,
  WorkspaceProjectSummary,
  WorkspaceScene,
} from "./project/presentation.js";

export type {
  CheckpointOptions,
  CheckpointRef,
  CheckpointStatus,
  ClarosProject,
  CreateChapterOptions,
  CreateSceneOptions,
  CreateNoteFolderOptions,
  CreateNoteOptions,
  DocumentRef,
  HistoryOptions,
  LinkRef,
  LinkResolution,
  ManuscriptInsertionPlacement,
  ManuscriptMoveResult,
  MoveChapterOptions,
  MoveNoteOptions,
  MoveSceneOptions,
  MutationResult,
  ProjectExecuteMacroInDocumentOptions,
  RestoreCheckpointOptions,
  SearchOptions,
  SearchResult,
  SetFrontmatterPathOptions,
  StructuralMutationPlan,
  TimelineRef,
  WriteDocumentOptions,
} from "./project/workspace.js";

export interface BrowserOpenProjectOptions {
  fileReader: ProjectFileReader;
  fileWriter: ProjectFileWriter;
}

const ROOT = "/";
const LEDGER_PATH = "state/runs/emergence.yaml";

export async function openProject(
  _root: string,
  options: BrowserOpenProjectOptions
): Promise<ClarosProject> {
  const snapshot = await scanProjectFormat(ROOT, options.fileReader);
  const runs = await readMacroRuns(options.fileReader);
  const index = createInMemoryProjectIndex();
  await index.build(snapshot, runs);

  return new BrowserClarosProject(
    ROOT,
    snapshot.manifest,
    options.fileReader,
    options.fileWriter,
    index
  );
}

class BrowserClarosProject implements ClarosProject {
  private readonly mutations: ProjectMutationEngine;

  constructor(
    public readonly root: string,
    public readonly manifest: ProjectManifest,
    private readonly fileReader: ProjectFileReader,
    private readonly fileWriter: ProjectFileWriter,
    private readonly index: ProjectIndex
  ) {
    this.mutations = new ProjectMutationEngine({
      fileReader,
      fileWriter,
      index,
      toStoragePath: toRootPath,
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

  listNoteFolders(): NoteFolderRef[] {
    return this.index.listNoteFolders();
  }

  async readDocument(ref: DocumentRef): Promise<MarkdownDocument> {
    const path = resolveDocumentPath(ref);
    return parseMarkdownDocument(path, await this.fileReader.readFile(toRootPath(path)));
  }

  async writeDocument(
    ref: DocumentRef,
    document: MarkdownDocument | string,
    options?: WriteDocumentOptions
  ): Promise<MutationResult> {
    const path = resolveDocumentPath(ref);
    const raw = typeof document === "string" ? document : document.raw;
    await this.fileWriter.writeFileAtomic(toRootPath(path), raw);
    if (options?.refreshIndex ?? true) {
      await this.index.updateDocument(path, raw);
      return { kind: "document-write", changedPaths: [path], indexUpdated: true };
    }
    return { kind: "document-write", changedPaths: [path], indexUpdated: false };
  }

  async getStoryState(statePath: string): Promise<unknown> {
    return getAtPath(await this.readStateFile("state/story.yaml"), statePath);
  }

  async setStoryState(statePath: string, value: unknown): Promise<MutationResult> {
    return this.setStateFile("state/story.yaml", statePath, value);
  }

  async getSceneState(sceneId: string, statePath: string): Promise<unknown> {
    return getAtPath(await this.readStateFile(`state/scenes/${sceneId}.yaml`), statePath);
  }

  async setSceneState(sceneId: string, statePath: string, value: unknown): Promise<MutationResult> {
    return this.setStateFile(`state/scenes/${sceneId}.yaml`, statePath, value);
  }

  async getChapterState(chapterId: string, statePath: string): Promise<unknown> {
    return getAtPath(await this.readStateFile(`state/chapters/${chapterId}.yaml`), statePath);
  }

  async setChapterState(
    chapterId: string,
    statePath: string,
    value: unknown
  ): Promise<MutationResult> {
    return this.setStateFile(`state/chapters/${chapterId}.yaml`, statePath, value);
  }

  async getNoteFrontmatterPath(note: NoteRef | string, frontmatterPath: string): Promise<unknown> {
    const path = resolveNoteReference(note);
    const document = await this.readDocument({ path });
    return getAtPath(document.frontmatter ?? {}, frontmatterPath);
  }

  async setNoteFrontmatterPath(
    note: NoteRef | string,
    frontmatterPath: string,
    value: unknown,
    options?: SetFrontmatterPathOptions
  ): Promise<MutationResult> {
    const path = resolveNoteReference(note);
    const raw = await this.fileReader.readFile(toRootPath(path));
    const parsed = parseNoteFrontmatter(raw);
    const frontmatter = setAtPath(parsed.frontmatter, frontmatterPath, value);
    const nextRaw = serializeNoteFrontmatter(frontmatter, parsed.body);
    await this.fileWriter.writeFileAtomic(toRootPath(path), nextRaw);
    if (options?.refreshIndex ?? true) {
      await this.index.updateDocument(path, nextRaw);
      return { kind: "frontmatter-path", changedPaths: [path], indexUpdated: true };
    }
    return { kind: "frontmatter-path", changedPaths: [path], indexUpdated: false };
  }

  async setProjectMetadataPath(metadataPath: string, value: unknown): Promise<MutationResult> {
    const current = await this.readYamlObject("claros.yaml");
    const next = setAtPath(current, metadataPath, value);
    await this.fileWriter.writeFileAtomic(toRootPath("claros.yaml"), dump(next, { lineWidth: -1 }));
    await this.rebuildIndex();
    return { kind: "metadata", changedPaths: ["claros.yaml"], indexUpdated: true };
  }

  async setChapterMetadataPath(
    chapterId: string,
    metadataPath: string,
    value: unknown
  ): Promise<MutationResult> {
    const path = `manuscript/${chapterId}/chapter.yaml`;
    const current = await this.readYamlObject(path);
    const next = setAtPath(current, metadataPath, value);
    await this.fileWriter.writeFileAtomic(toRootPath(path), dump(next, { lineWidth: -1 }));
    await this.rebuildIndex();
    return { kind: "metadata", changedPaths: [path], indexUpdated: true };
  }

  async setProjectTitle(title: string): Promise<MutationResult> {
    const current = await this.readYamlObject("claros.yaml");
    await this.fileWriter.writeFileAtomic(
      toRootPath("claros.yaml"),
      dump({ ...current, title: normalizedBrowserProjectTitle(title) }, { lineWidth: -1 })
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

  createNote(
    title: string,
    options?: CreateNoteOptions
  ): Promise<{ result: MutationResult; note: NoteRef }> {
    return this.mutations.createNote(title, options);
  }

  createNoteFolder(
    title: string,
    options?: CreateNoteFolderOptions
  ): Promise<{ result: MutationResult; folder: NoteFolderRef }> {
    return this.mutations.createNoteFolder(title, options);
  }

  deleteNote(
    note: NoteRef | string
  ): Promise<{ result: MutationResult; nextDocument?: DocumentRef }> {
    return this.mutations.deleteNote(note);
  }

  deleteNoteFolder(
    folder: NoteFolderRef | string
  ): Promise<{ result: MutationResult; nextDocument?: DocumentRef }> {
    return this.mutations.deleteNoteFolder(folder);
  }

  moveNote(
    note: NoteRef | string,
    options?: MoveNoteOptions
  ): Promise<{ result: MutationResult; note: NoteRef }> {
    return this.mutations.moveNote(note, options);
  }

  planRenameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: { rewriteLinks?: boolean }
  ): Promise<StructuralMutationPlan> {
    return this.mutations.planRenameNote(note, nextPath, options?.rewriteLinks ?? false);
  }

  async renameNote(
    note: NoteRef | string,
    nextPath: string,
    options?: { rewriteLinks?: boolean; dryRun?: boolean }
  ): Promise<MutationResult> {
    const plan = await this.planRenameNote(note, nextPath, options);
    if (options?.dryRun ?? false) {
      return { kind: "structural", changedPaths: [], indexUpdated: false };
    }
    return this.mutations.applyRenamePlan(plan);
  }

  planRenameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: { rewriteLinks?: boolean }
  ): Promise<StructuralMutationPlan> {
    return this.mutations.planRenameScene(scene, nextSlug, options?.rewriteLinks ?? false);
  }

  async renameScene(
    scene: SceneRef | string,
    nextSlug: string,
    options?: { rewriteLinks?: boolean; dryRun?: boolean }
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
      from === undefined ? undefined : { path: resolveDocumentPath(from) }
    );
  }

  getBacklinks(ref: DocumentRef): LinkRef[] {
    return this.index.getBacklinks({ path: resolveDocumentPath(ref) });
  }

  search(query: string, options?: SearchOptions): SearchResult[] {
    return this.index.search(query, options);
  }

  listClarosBlocks(ref?: DocumentRef): ClarosBlockRef[] {
    if (ref === undefined) {
      return this.index.listClarosBlocks();
    }
    const path = resolveDocumentPath(ref);
    return this.index.listClarosBlocks().filter((block) => block.fromPath === path);
  }

  executeMacroInDocument(
    _options: ProjectExecuteMacroInDocumentOptions
  ): Promise<ExecuteMacroInDocumentResult> {
    return Promise.reject(browserUnavailable("executeMacroInDocument"));
  }

  async listMacroRuns(filter?: MacroRunFilter): Promise<MacroRunLedgerEntry[]> {
    return filterMacroRuns(this.index.listMacroRuns(), filter);
  }

  async getMacroRun(id: string): Promise<MacroRunLedgerEntry | undefined> {
    return this.index.listMacroRuns().find((entry) => entry.id === id);
  }

  async checkpoint(_message?: string, _options?: CheckpointOptions): Promise<CheckpointRef> {
    throw browserUnavailable("checkpoint");
  }

  async getCheckpointStatus(): Promise<CheckpointStatus> {
    return {
      dirty: false,
      changedPaths: [],
      currentTimeline: "working",
    };
  }

  async listCheckpoints(_options?: HistoryOptions): Promise<CheckpointRef[]> {
    return [];
  }

  async restoreCheckpoint(_id: string, _options?: RestoreCheckpointOptions): Promise<TimelineRef> {
    throw browserUnavailable("restoreCheckpoint");
  }

  private async readStateFile(path: string): Promise<Record<string, unknown>> {
    const stat = await this.fileReader.stat(toRootPath(path));
    if (!stat.exists || stat.isDirectory) {
      return {};
    }
    return parseStateFile(await this.fileReader.readFile(toRootPath(path))).data;
  }

  private async setStateFile(
    path: string,
    statePath: string,
    value: unknown
  ): Promise<MutationResult> {
    const current = await this.readStateFile(path);
    const next = setAtPath(current, statePath, value);
    await this.fileWriter.writeFileAtomic(toRootPath(path), serializeStateFile({ data: next }));
    return { kind: "state-path", changedPaths: [path], indexUpdated: false };
  }

  private async readYamlObject(path: string): Promise<Record<string, unknown>> {
    const stat = await this.fileReader.stat(toRootPath(path));
    if (!stat.exists || stat.isDirectory) {
      return {};
    }
    const parsed = load(await this.fileReader.readFile(toRootPath(path)));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }

  private async rebuildIndex(): Promise<void> {
    const snapshot = await scanProjectFormat(ROOT, this.fileReader);
    await this.index.build(snapshot, await readMacroRuns(this.fileReader));
  }
}

async function readMacroRuns(fileReader: ProjectFileReader): Promise<MacroRunLedgerEntry[]> {
  const stat = await fileReader.stat(toRootPath(LEDGER_PATH));
  if (!stat.exists || stat.isDirectory) {
    return [];
  }

  const parsed = parseStateFile(await fileReader.readFile(toRootPath(LEDGER_PATH))).data;
  const runs = parsed.runs;
  return Array.isArray(runs) ? runs.flatMap(normalizeMacroRunEntry) : [];
}

function normalizeMacroRunEntry(raw: unknown): MacroRunLedgerEntry[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }
  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    (typeof entry.createdAt !== "string" && typeof entry.created_at !== "string") ||
    typeof entry.macro !== "string"
  ) {
    return [];
  }

  return [
    {
      id: entry.id,
      createdAt:
        typeof entry.createdAt === "string" ? entry.createdAt : (entry.created_at as string),
      macro: entry.macro,
      document: typeof entry.document === "string" ? entry.document : undefined,
      sceneId: typeof entry.sceneId === "string" ? entry.sceneId : stringValue(entry.scene_id),
      chapterId:
        typeof entry.chapterId === "string" ? entry.chapterId : stringValue(entry.chapter_id),
      params: recordValue(entry.params),
      rolls: Array.isArray(entry.rolls) ? entry.rolls.flatMap(normalizeMacroRunRoll) : [],
      output: recordValue(entry.output),
      display: normalizeMacroRunDisplay(entry.display),
      effects: Array.isArray(entry.effects)
        ? entry.effects.flatMap(normalizeMacroRunEffect)
        : undefined,
    },
  ];
}

function normalizeMacroRunRoll(raw: unknown): MacroRunRoll[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }
  const roll = raw as Record<string, unknown>;
  if (typeof roll.notation !== "string") {
    return [];
  }
  return [
    {
      notation: roll.notation,
      total: typeof roll.total === "number" ? roll.total : undefined,
      values: numberList(roll.values),
      kept: numberList(roll.kept),
      label: typeof roll.label === "string" ? roll.label : undefined,
    },
  ];
}

function normalizeMacroRunDisplay(raw: unknown): MacroRunDisplay | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const display = raw as Record<string, unknown>;
  return display.format === "markdown" && typeof display.block === "string"
    ? { format: "markdown", block: display.block }
    : undefined;
}

function normalizeMacroRunEffect(raw: unknown): MacroRunEffect[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }
  const effect = raw as Record<string, unknown>;
  return typeof effect.target === "string"
    ? [{ target: effect.target, old: effect.old, new: effect.new }]
    : [];
}

function filterMacroRuns(
  runs: MacroRunLedgerEntry[],
  filter?: MacroRunFilter
): MacroRunLedgerEntry[] {
  if (filter === undefined) {
    return runs;
  }
  let filtered = runs.filter((entry) => {
    return (
      (filter.document === undefined || entry.document === filter.document) &&
      (filter.macroId === undefined || entry.macro === filter.macroId) &&
      (filter.sceneId === undefined || entry.sceneId === filter.sceneId) &&
      (filter.chapterId === undefined || entry.chapterId === filter.chapterId)
    );
  });
  if (filter.since !== undefined) {
    const since = Date.parse(filter.since);
    if (!Number.isNaN(since)) {
      filtered = filtered.filter((entry) => Date.parse(entry.createdAt) >= since);
    }
  }
  return filter.limit === undefined ? filtered : filtered.slice(-filter.limit);
}

function resolveDocumentPath(ref: DocumentRef): string {
  return normalizeRelativePath(ref.path);
}

function resolveNoteReference(note: NoteRef | string): string {
  return normalizeRelativePath(typeof note === "string" ? note : note.path);
}

function toRootPath(path: string): string {
  return `/${normalizeRelativePath(path)}`;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function normalizedBrowserProjectTitle(title: string): string {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : "Untitled Project";
}

function browserUnavailable(action: string): Error {
  return new Error(`${action} is not available in the browser workspace adapter yet`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberList(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number")
    ? value
    : undefined;
}
