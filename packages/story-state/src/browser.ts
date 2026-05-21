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
  DocumentRef,
  HistoryOptions,
  LinkRef,
  LinkResolution,
  MutationResult,
  ProjectExecuteMacroInDocumentOptions,
  RestoreCheckpointOptions,
  SearchOptions,
  SearchResult,
  SetFrontmatterPathOptions,
  TimelineRef,
  WriteDocumentOptions,
} from "./project/workspace.js";
import type {
  ExecuteMacroInDocumentResult,
  MacroRunDisplay,
  MacroRunEffect,
  MacroRunFilter,
  MacroRunLedgerEntry,
  MacroRunRoll,
} from "./runs/types.js";

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
  constructor(
    public readonly root: string,
    public readonly manifest: ProjectManifest,
    private readonly fileReader: ProjectFileReader,
    private readonly fileWriter: ProjectFileWriter,
    private readonly index: ProjectIndex
  ) {}

  listChapters(): ChapterRef[] {
    return this.index.listChapters();
  }

  listScenes(): SceneRef[] {
    return this.index.listScenes();
  }

  listNotes(): NoteRef[] {
    return this.index.listNotes();
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
    return { kind: "metadata", changedPaths: [path], indexUpdated: true };
  }

  async setProjectTitle(title: string): Promise<MutationResult> {
    const current = await this.readYamlObject("claros.yaml");
    await this.fileWriter.writeFileAtomic(
      toRootPath("claros.yaml"),
      dump({ ...current, title: normalizedProjectTitle(title) }, { lineWidth: -1 })
    );
    await this.rebuildIndex();
    return { kind: "metadata", changedPaths: ["claros.yaml"], indexUpdated: true };
  }

  async setChapterTitle(chapterId: string, title: string): Promise<MutationResult> {
    const current = this.resolveChapter(chapterId);
    const currentRaw = await this.readOptionalFile(`${current.path}/chapter.yaml`);
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
    const current = this.resolveScene(scene);
    const raw = await this.fileReader.readFile(toRootPath(current.path));
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
    const chapterSequence = nextSequence(this.listChapters().map((chapter) => chapter.sequence));
    const sceneSequence = nextSequence(this.listScenes().map((scene) => scene.sequence));
    const chapterId = this.uniqueChapterId(chapterSequence, chapterTitle);
    const scenePath = this.uniqueScenePath(chapterId, sceneSequence, sceneTitle);
    await this.fileWriter.mkdir(toRootPath(`manuscript/${chapterId}`), true);
    await this.fileWriter.writeFileAtomic(
      toRootPath(`manuscript/${chapterId}/chapter.yaml`),
      serializeTitleYaml(chapterTitle)
    );
    await this.fileWriter.writeFileAtomic(
      toRootPath(scenePath),
      serializeSceneMarkdown(sceneTitle)
    );
    await this.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [
          `manuscript/${chapterId}`,
          `manuscript/${chapterId}/chapter.yaml`,
          scenePath,
        ],
        indexUpdated: true,
      },
      scene: this.sceneByPath(scenePath),
    };
  }

  async appendScene(title: string): Promise<{ result: MutationResult; scene: SceneRef }> {
    const lastChapter = this.listChapters().at(-1);
    if (lastChapter === undefined) {
      return this.appendChapter("", title);
    }
    const sceneSequence = nextSequence(this.listScenes().map((scene) => scene.sequence));
    const scenePath = this.uniqueScenePath(lastChapter.id, sceneSequence, title);
    await this.fileWriter.writeFileAtomic(toRootPath(scenePath), serializeSceneMarkdown(title));
    await this.rebuildIndex();
    return {
      result: { kind: "structural", changedPaths: [scenePath], indexUpdated: true },
      scene: this.sceneByPath(scenePath),
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

    const target = this.resolveChapter(options.targetChapter);
    const chapters = this.listChapters();
    const scenes = this.listScenes();
    const targetIndex = chapters.findIndex((chapter) => chapter.id === target.id);
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
    if (scene === undefined) {
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

    const target = this.resolveScene(options.targetScene);
    const targetIndex = this.listScenes().findIndex((scene) => scene.path === target.path);
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
    const scenes = this.listScenes();
    if (this.listChapters().length <= 1 || scenes.every((scene) => scene.chapterId === chapterId)) {
      throw new Error("Cannot delete the final remaining chapter");
    }
    const index = scenes.findIndex((scene) => scene.chapterId === chapterId);
    const result = await this.rebuildManuscript((chapter) => chapter.id !== chapterId);
    return { result, nextScene: sceneAtNearestIndex(this.listScenes(), index) };
  }

  async deleteScene(
    scene: SceneRef | string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef }> {
    const current = this.resolveScene(scene);
    const scenes = this.listScenes();
    if (scenes.length <= 1) {
      throw new Error("Cannot delete the final remaining scene");
    }
    const index = scenes.findIndex((candidate) => candidate.path === current.path);
    const removeChapter =
      scenes.filter((candidate) => candidate.chapterId === current.chapterId).length === 1;
    const result = await this.rebuildManuscript(
      (chapter) => !removeChapter || chapter.id !== current.chapterId,
      (candidate) => candidate.path !== current.path
    );
    return { result, nextScene: sceneAtNearestIndex(this.listScenes(), index) };
  }

  planRenameNote(): Promise<never> {
    return Promise.reject(browserUnavailable("planRenameNote"));
  }

  renameNote(): Promise<never> {
    return Promise.reject(browserUnavailable("renameNote"));
  }

  planRenameScene(): Promise<never> {
    return Promise.reject(browserUnavailable("planRenameScene"));
  }

  renameScene(): Promise<never> {
    return Promise.reject(browserUnavailable("renameScene"));
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

  private resolveScene(scene: SceneRef | string): SceneRef {
    if (typeof scene !== "string") {
      return scene;
    }
    const normalized = normalizeRelativePath(scene);
    const match = this.listScenes().find(
      (candidate) => candidate.id === normalized || candidate.path === normalized
    );
    if (match === undefined) {
      throw new Error(`Scene not found: ${scene}`);
    }
    return match;
  }

  private resolveChapter(chapterId: ChapterRef | string): ChapterRef {
    if (typeof chapterId !== "string") {
      return chapterId;
    }

    const normalized = normalizeRelativePath(chapterId);
    const match = this.listChapters().find(
      (candidate) => candidate.id === normalized || candidate.path === normalized
    );
    if (match === undefined) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
    return match;
  }

  private sceneByPath(path: string): SceneRef {
    const scene = this.listScenes().find((candidate) => candidate.path === path);
    if (scene === undefined) {
      throw new Error(`Scene not found after manuscript mutation: ${path}`);
    }
    return scene;
  }

  private uniqueChapterId(sequence: number, title: string): string {
    const prefix = sequencePrefix(sequence);
    const slug = title.trim().length > 0 ? slugifyPathComponent(title) : `chapter-${sequence}`;
    return uniqueSequenceName(
      prefix,
      slug,
      new Set(this.listChapters().map((chapter) => chapter.id))
    );
  }

  private uniqueScenePath(chapterId: string, sequence: number, title: string): string {
    const prefix = sequencePrefix(sequence);
    const slug = title.trim().length > 0 ? slugifyPathComponent(title) : `scene-${sequence}`;
    const existing = new Set(
      this.listScenes().map((scene) => basenameWithoutExtension(scene.path))
    );
    return `manuscript/${chapterId}/${uniqueSequenceName(prefix, slug, existing)}.md`;
  }

  private async rebuildManuscript(
    keepChapter: (chapter: ChapterRef) => boolean,
    keepScene: (scene: SceneRef) => boolean = () => true,
    transform: ManuscriptRebuildTransform = {},
    insertion?: ManuscriptInsertion
  ): Promise<MutationResult> {
    const scenesByChapter = new Map<string, SceneRef[]>();
    for (const scene of this.listScenes().filter(keepScene)) {
      const scenes = scenesByChapter.get(scene.chapterId) ?? [];
      scenes.push(scene);
      scenesByChapter.set(scene.chapterId, scenes);
    }

    const rebuilt: RebuiltChapter[] = [];
    let chapterSequence = 1;
    let sceneSequence = 1;
    for (const chapter of this.listChapters()) {
      if (!keepChapter(chapter)) {
        continue;
      }
      if (insertion?.targetChapterId === chapter.id && insertion.placement === "before") {
        rebuilt.push(buildInsertedChapter(insertion, chapterSequence, sceneSequence));
        chapterSequence += 1;
        sceneSequence += 1;
      }
      const scenes = scenesByChapter.get(chapter.id) ?? [];
      if (scenes.length === 0) {
        continue;
      }
      const chapterTransform = transform.chapter?.(chapter, chapterSequence) ?? {};
      const nextChapterSlug =
        chapterTransform.slug ?? resequenceDefaultSlug(chapter.slug, "chapter", chapterSequence);
      const nextChapterId = `${sequencePrefix(chapterSequence)}-${nextChapterSlug}`;
      const chapterRaw =
        chapterTransform.raw ?? (await this.readOptionalFile(`${chapter.path}/chapter.yaml`));
      const rebuiltScenes: RebuiltScene[] = [];
      for (const scene of scenes) {
        if (insertion?.targetScenePath === scene.path && insertion.placement === "before") {
          rebuiltScenes.push(
            buildInsertedScene(insertion.sceneTitle, nextChapterId, sceneSequence)
          );
          sceneSequence += 1;
        }
        const sceneTransform = transform.scene?.(scene, sceneSequence) ?? {};
        const nextSceneSlug =
          sceneTransform.slug ?? resequenceDefaultSlug(scene.slug, "scene", sceneSequence);
        rebuiltScenes.push({
          path: `manuscript/${nextChapterId}/${sequencePrefix(sceneSequence)}-${nextSceneSlug}.md`,
          raw: sceneTransform.raw ?? (await this.fileReader.readFile(toRootPath(scene.path))),
        });
        sceneSequence += 1;
        if (insertion?.targetScenePath === scene.path && insertion.placement === "after") {
          rebuiltScenes.push(
            buildInsertedScene(insertion.sceneTitle, nextChapterId, sceneSequence)
          );
          sceneSequence += 1;
        }
      }
      rebuilt.push({ path: `manuscript/${nextChapterId}`, chapterRaw, scenes: rebuiltScenes });
      chapterSequence += 1;
      if (insertion?.targetChapterId === chapter.id && insertion.placement === "after") {
        rebuilt.push(buildInsertedChapter(insertion, chapterSequence, sceneSequence));
        chapterSequence += 1;
        sceneSequence += 1;
      }
    }

    await this.fileWriter.removeFile(toRootPath("manuscript"));
    await this.fileWriter.mkdir(toRootPath("manuscript"), true);
    const changedPaths = new Set<string>(["manuscript"]);
    for (const chapter of rebuilt) {
      await this.fileWriter.mkdir(toRootPath(chapter.path), true);
      changedPaths.add(chapter.path);
      if (chapter.chapterRaw !== undefined) {
        const chapterMetadataPath = `${chapter.path}/chapter.yaml`;
        await this.fileWriter.writeFileAtomic(toRootPath(chapterMetadataPath), chapter.chapterRaw);
        changedPaths.add(chapterMetadataPath);
      }
      for (const scene of chapter.scenes) {
        await this.fileWriter.writeFileAtomic(toRootPath(scene.path), scene.raw);
        changedPaths.add(scene.path);
      }
    }
    await this.rebuildIndex();
    return { kind: "structural", changedPaths: [...changedPaths].sort(), indexUpdated: true };
  }

  private async readOptionalFile(path: string): Promise<string | undefined> {
    const stat = await this.fileReader.stat(toRootPath(path));
    return stat.exists && !stat.isDirectory
      ? this.fileReader.readFile(toRootPath(path))
      : undefined;
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
    path: `manuscript/${chapterId}`,
    chapterRaw: serializeTitleYaml(chapterTitle),
    scenes: [buildInsertedScene(insertion.sceneTitle, chapterId, sceneSequence)],
  };
}

function buildInsertedScene(title: string, chapterId: string, sceneSequence: number): RebuiltScene {
  const sceneSlug = slugForTitle(title, "scene", sceneSequence);
  return {
    path: `manuscript/${chapterId}/${sequencePrefix(sceneSequence)}-${sceneSlug}.md`,
    raw: serializeSceneMarkdown(title),
  };
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
  return Object.keys(frontmatter).length === 0
    ? parsed.body
    : serializeNoteFrontmatter(frontmatter, parsed.body);
}

function serializeChapterYamlWithTitle(raw: string | undefined, title: string): string {
  const current = raw === undefined || raw.trim().length === 0 ? {} : load(raw);
  const metadata = withOptionalTitle(isRecord(current) ? current : {}, title);
  return Object.keys(metadata).length === 0 ? "" : dump(metadata, { lineWidth: -1 });
}

function serializeTitleYaml(title: string): string {
  const metadata = withOptionalTitle({}, title);
  return Object.keys(metadata).length === 0 ? "" : dump(metadata, { lineWidth: -1 });
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

function slugForTitle(title: string, kind: "chapter" | "scene", sequence: number): string {
  const normalized = title.trim();
  return normalized.length > 0 ? slugifyPathComponent(normalized) : `${kind}-${sequence}`;
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

function basenameWithoutExtension(path: string): string {
  const basename = path.split("/").at(-1) ?? path;
  return basename.toLowerCase().endsWith(".md") ? basename.slice(0, -3) : basename;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sceneAtNearestIndex(scenes: SceneRef[], index: number): SceneRef | undefined {
  if (scenes.length === 0) {
    return undefined;
  }
  return scenes[Math.min(Math.max(index, 0), scenes.length - 1)];
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
