import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  scanProjectFormat,
  parseMarkdownDocument,
  type ChapterRef,
  type ClarosBlockRef,
  type MarkdownDocument,
  type NoteRef,
  type ProjectFileReader,
  type ProjectFileWriter,
  type ProjectManifest,
  type SceneRef,
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
  writeDocument(ref: DocumentRef, document: MarkdownDocument | string): Promise<void>;

  getStoryState(statePath: string): Promise<unknown>;
  setStoryState(statePath: string, value: unknown): Promise<void>;
  getSceneState(sceneId: string, statePath: string): Promise<unknown>;
  setSceneState(sceneId: string, statePath: string, value: unknown): Promise<void>;
  getChapterState(chapterId: string, statePath: string): Promise<unknown>;
  setChapterState(chapterId: string, statePath: string, value: unknown): Promise<void>;

  getNoteFrontmatterPath(note: NoteRef | string, frontmatterPath: string): Promise<unknown>;
  setNoteFrontmatterPath(
    note: NoteRef | string,
    frontmatterPath: string,
    value: unknown
  ): Promise<void>;

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
  options?: OpenProjectOptions
): Promise<void> {
  const fileWriter = options?.fileWriter ?? new NodeProjectFileWriter();
  const normalizedRoot = normalizeProjectRoot(projectRoot);
  const relativePath = resolveDocumentPath(normalizedRoot, ref);
  const absolutePath = toAbsoluteProjectPath(normalizedRoot, relativePath);
  const raw = typeof document === "string" ? document : document.raw;
  await ensureParentDirectory(absolutePath, fileWriter);
  await fileWriter.writeFileAtomic(absolutePath, raw);
}

export async function getStoryState(projectRoot: string, statePath: string): Promise<unknown> {
  return new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).getStory(
    statePath
  );
}

export async function setStoryState(
  projectRoot: string,
  statePath: string,
  value: unknown
): Promise<void> {
  new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).setStory(
    statePath,
    value
  );
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
  value: unknown
): Promise<void> {
  new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).setScene(
    sceneId,
    statePath,
    value
  );
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
  value: unknown
): Promise<void> {
  new FileStateAdapter({ projectRoot: normalizeProjectRoot(projectRoot) }).setChapter(
    chapterId,
    statePath,
    value
  );
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
  options?: OpenProjectOptions & NoteFrontmatterIOOptions
): Promise<void> {
  await setNoteFrontmatterPath(
    resolveNoteReference(note),
    projectRoot,
    frontmatterPath,
    value,
    options
  );
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

  async writeDocument(ref: DocumentRef, document: MarkdownDocument | string): Promise<void> {
    await writeDocument(this.root, ref, document, this.fileOptions());
    await this.refreshDocument(ref);
  }

  async getStoryState(statePath: string): Promise<unknown> {
    return this.stateAdapter.getStory(statePath);
  }

  async setStoryState(statePath: string, value: unknown): Promise<void> {
    this.stateAdapter.setStory(statePath, value);
  }

  async getSceneState(sceneId: string, statePath: string): Promise<unknown> {
    return this.stateAdapter.getScene(sceneId, statePath);
  }

  async setSceneState(sceneId: string, statePath: string, value: unknown): Promise<void> {
    this.stateAdapter.setScene(sceneId, statePath, value);
  }

  async getChapterState(chapterId: string, statePath: string): Promise<unknown> {
    return this.stateAdapter.getChapter(chapterId, statePath);
  }

  async setChapterState(chapterId: string, statePath: string, value: unknown): Promise<void> {
    this.stateAdapter.setChapter(chapterId, statePath, value);
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
    value: unknown
  ): Promise<void> {
    await setNoteFrontmatterPath(
      resolveNoteReference(note),
      this.root,
      frontmatterPath,
      value,
      this.fileOptions()
    );
    await this.refreshDocument(resolveNoteReference(note));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
