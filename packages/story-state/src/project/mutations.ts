import {
  parseNoteFrontmatter,
  parseStateFile,
  serializeNoteFrontmatter,
  serializeStateFile,
  type ChapterRef,
  type NoteFolderRef,
  type NoteRef,
  type ProjectFileReader,
  type ProjectFileWriter,
  type SceneRef,
} from "@claros/story-format/browser";
import type { ProjectIndex } from "./index.js";
import type {
  CreateChapterOptions,
  CreateSceneOptions,
  CreateNoteFolderOptions,
  CreateNoteOptions,
  LinkRef,
  LinkRewrite,
  LinkRewritePlan,
  ManuscriptMoveResult,
  MoveChapterOptions,
  MoveNoteOptions,
  MoveSceneOptions,
  MutationResult,
  MutationWarning,
  StructuralMutationPlan,
} from "./workspace.js";

export interface ProjectMutationEngineOptions {
  fileReader: ProjectFileReader;
  fileWriter: ProjectFileWriter;
  index: ProjectIndex;
  toStoragePath: (relativePath: string) => string;
  rebuildIndex: () => Promise<void>;
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

export class ProjectMutationEngine {
  constructor(private readonly options: ProjectMutationEngineOptions) {}

  listChapters(): ChapterRef[] {
    return this.options.index.listChapters();
  }

  listScenes(): SceneRef[] {
    return this.options.index.listScenes();
  }

  listNotes(): NoteRef[] {
    return this.options.index.listNotes();
  }

  async setChapterTitle(chapterId: string, title: string): Promise<ManuscriptMoveResult> {
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

  async setSceneTitle(scene: SceneRef | string, title: string): Promise<ManuscriptMoveResult> {
    const current = this.resolveScene(scene);
    const raw = await this.options.fileReader.readFile(this.storagePath(current.path));
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
  ): Promise<{ result: MutationResult; scene: SceneRef; pathMap: Record<string, string> }> {
    const chapterSequence = nextSequence(this.listChapters().map((chapter) => chapter.sequence));
    const sceneSequence = nextSequence(this.listScenes().map((scene) => scene.sequence));
    const chapterId = this.uniqueChapterId(chapterSequence, chapterTitle);
    const scenePath = this.uniqueScenePath(chapterId, sceneSequence, sceneTitle);
    const chapterPath = `manuscript/${chapterId}`;
    const chapterMetadataPath = `${chapterPath}/chapter.yaml`;

    await this.options.fileWriter.mkdir(this.storagePath(chapterPath), true);
    await this.options.fileWriter.writeFileAtomic(
      this.storagePath(chapterMetadataPath),
      serializeTitleYaml(chapterTitle)
    );
    await this.options.fileWriter.writeFileAtomic(
      this.storagePath(scenePath),
      serializeSceneMarkdown(sceneTitle)
    );
    await this.options.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [chapterPath, chapterMetadataPath, scenePath],
        affectedPaths: [chapterPath, chapterMetadataPath, scenePath],
        pathMap: {},
        chapterIdMap: {},
        warnings: [],
        indexUpdated: true,
      },
      scene: this.sceneByPath(scenePath),
      pathMap: {},
    };
  }

  async appendScene(
    title: string
  ): Promise<{ result: MutationResult; scene: SceneRef; pathMap: Record<string, string> }> {
    const lastChapter = this.listChapters().at(-1);
    if (lastChapter === undefined) {
      return this.appendChapter("", title);
    }
    const sceneSequence = nextSequence(this.listScenes().map((scene) => scene.sequence));
    const scenePath = this.uniqueScenePath(lastChapter.id, sceneSequence, title);
    await this.options.fileWriter.writeFileAtomic(
      this.storagePath(scenePath),
      serializeSceneMarkdown(title)
    );
    await this.options.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [scenePath],
        affectedPaths: [scenePath],
        pathMap: {},
        chapterIdMap: {},
        warnings: [],
        indexUpdated: true,
      },
      scene: this.sceneByPath(scenePath),
      pathMap: {},
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

    const move = await this.rebuildManuscript(
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
    return { result: move.result, scene };
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
    const move = await this.rebuildManuscript(
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
    return { result: move.result, scene };
  }

  async deleteChapter(
    chapterId: string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef; pathMap: Record<string, string> }> {
    const chapters = this.listChapters();
    const scenes = this.listScenes();
    if (chapters.length <= 1 || scenes.every((scene) => scene.chapterId === chapterId)) {
      throw new Error("Cannot delete the final remaining chapter");
    }
    const firstRemovedSceneIndex = scenes.findIndex((scene) => scene.chapterId === chapterId);
    const move = await this.rebuildManuscript((chapter) => chapter.id !== chapterId);
    return {
      result: move.result,
      nextScene: sceneAtNearestIndex(this.listScenes(), firstRemovedSceneIndex),
      pathMap: move.pathMap,
    };
  }

  async deleteScene(
    scene: SceneRef | string
  ): Promise<{ result: MutationResult; nextScene?: SceneRef; pathMap: Record<string, string> }> {
    const current = this.resolveScene(scene);
    const scenes = this.listScenes();
    if (scenes.length <= 1) {
      throw new Error("Cannot delete the final remaining scene");
    }
    const sceneIndex = scenes.findIndex((candidate) => candidate.path === current.path);
    const removeChapter =
      scenes.filter((candidate) => candidate.chapterId === current.chapterId).length === 1;
    const move = await this.rebuildManuscript(
      (chapter) => !removeChapter || chapter.id !== current.chapterId,
      (candidate) => candidate.path !== current.path
    );
    return {
      result: move.result,
      nextScene: sceneAtNearestIndex(this.listScenes(), sceneIndex),
      pathMap: move.pathMap,
    };
  }

  async moveChapter(
    chapter: ChapterRef | string,
    options: MoveChapterOptions
  ): Promise<ManuscriptMoveResult & { chapter: ChapterRef }> {
    const current = this.resolveChapter(chapter);
    const target = this.resolveChapter(options.targetChapter);
    const chapters = this.listChapters();
    const currentIndex = chapters.findIndex((candidate) => candidate.id === current.id);
    const remaining = chapters.filter((candidate) => candidate.id !== current.id);
    const targetIndex = remaining.findIndex((candidate) => candidate.id === target.id);
    const insertionIndex = options.placement === "before" ? targetIndex : targetIndex + 1;
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
    return { ...move, chapter: this.resolveChapter(move.chapterIdMap[current.id] ?? current.id) };
  }

  async moveScene(
    scene: SceneRef | string,
    options: MoveSceneOptions
  ): Promise<ManuscriptMoveResult & { scene: SceneRef }> {
    const current = this.resolveScene(scene);
    const scenes = this.listScenes();
    const currentIndex = scenes.findIndex((candidate) => candidate.path === current.path);
    const remaining = scenes.filter((candidate) => candidate.path !== current.path);
    let insertionIndex: number;
    let targetChapterId: string;
    if (options.placement === "append") {
      if (options.targetChapter === undefined) {
        throw new Error("Cannot append scene without a target chapter");
      }
      const targetChapter = this.resolveChapter(options.targetChapter);
      targetChapterId = targetChapter.id;
      insertionIndex = appendSceneIndexForChapter(remaining, this.listChapters(), targetChapter.id);
    } else {
      if (options.targetScene === undefined) {
        throw new Error("Cannot move scene without a target scene");
      }
      const target = this.resolveScene(options.targetScene);
      if (target.path === current.path) {
        return {
          result: { kind: "structural", changedPaths: [], indexUpdated: false },
          pathMap: {},
          chapterIdMap: {},
          scene: current,
        };
      }
      const targetIndex = remaining.findIndex((candidate) => candidate.path === target.path);
      insertionIndex = options.placement === "before" ? targetIndex : targetIndex + 1;
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
    return { ...move, scene: this.resolveScene(move.pathMap[current.path] ?? current.path) };
  }

  async createNote(
    title: string,
    options: CreateNoteOptions = {}
  ): Promise<{ result: MutationResult; note: NoteRef }> {
    const folderPath = normalizeNoteFolderPath(options.folderPath);
    const notePath = await this.uniqueNotePath(folderPath, title);
    await this.options.fileWriter.writeFileAtomic(
      this.storagePath(notePath),
      serializeNoteMarkdown(title)
    );
    await this.options.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [notePath],
        affectedPaths: [notePath],
        warnings: [],
        indexUpdated: true,
      },
      note: this.noteByPath(notePath),
    };
  }

  async createNoteFolder(
    title: string,
    options: CreateNoteFolderOptions = {}
  ): Promise<{ result: MutationResult; folder: NoteFolderRef }> {
    const parent = normalizeNoteFolderPath(options.parentFolderPath);
    const folderPath = await this.uniqueNoteFolderPath(parent, title);
    await this.options.fileWriter.mkdir(this.storagePath(folderPath), true);
    await this.options.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [folderPath],
        affectedPaths: [folderPath],
        warnings: [],
        indexUpdated: true,
      },
      folder: this.noteFolderByPath(folderPath),
    };
  }

  async deleteNote(
    note: NoteRef | string
  ): Promise<{ result: MutationResult; nextDocument?: SceneRef | NoteRef }> {
    const current = this.resolveNote(note);
    const noteIndex = this.listNotes().findIndex((candidate) => candidate.path === current.path);
    await this.options.fileWriter.removeFile(this.storagePath(current.path));
    await this.options.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [current.path],
        affectedPaths: [current.path],
        warnings: [],
        indexUpdated: true,
      },
      nextDocument: nextDocumentAfterNoteRemoval(this.listNotes(), this.listScenes(), noteIndex),
    };
  }

  async deleteNoteFolder(
    folder: NoteFolderRef | string
  ): Promise<{ result: MutationResult; nextDocument?: SceneRef | NoteRef }> {
    const folderPath = resolveNoteFolderPath(folder);
    if (folderPath === "notes") {
      throw new Error("Cannot delete the notes root folder");
    }
    const notes = this.listNotes();
    const firstRemovedNoteIndex = notes.findIndex((note) => note.path.startsWith(`${folderPath}/`));
    await this.options.fileWriter.removeFile(this.storagePath(folderPath));
    await this.options.rebuildIndex();
    return {
      result: {
        kind: "structural",
        changedPaths: [folderPath],
        affectedPaths: [folderPath],
        warnings: [],
        indexUpdated: true,
      },
      nextDocument: nextDocumentAfterNoteRemoval(
        this.listNotes(),
        this.listScenes(),
        firstRemovedNoteIndex
      ),
    };
  }

  async moveNote(
    note: NoteRef | string,
    options: MoveNoteOptions = {}
  ): Promise<{ result: MutationResult; note: NoteRef }> {
    const current = this.resolveNote(note);
    const targetFolder = normalizeNoteFolderPath(options.targetFolderPath);
    const basename = current.path.split("/").at(-1) ?? `${current.slug}.md`;
    const targetPath = await this.uniquePathInFolder(targetFolder, basename, current.path);
    const result = await this.applyRenamePlan(
      await this.planRenameNote(current, targetPath, options.rewriteLinks ?? false)
    );
    return { result, note: this.noteByPath(result.pathMap?.[current.path] ?? current.path) };
  }

  async planRenameNote(
    note: NoteRef | string,
    nextPath: string,
    rewriteLinks: boolean
  ): Promise<StructuralMutationPlan> {
    const current = this.resolveNote(note);
    return this.buildStructuralPlan(
      "rename-note",
      current.path,
      normalizeNoteTargetPath(nextPath),
      {
        rewriteLinks,
      }
    );
  }

  async planRenameScene(
    scene: SceneRef | string,
    nextSlug: string,
    rewriteLinks: boolean
  ): Promise<StructuralMutationPlan> {
    const current = this.resolveScene(scene);
    return this.buildStructuralPlan(
      "rename-scene",
      current.path,
      renameScenePath(current.path, nextSlug),
      {
        rewriteLinks,
      }
    );
  }

  async applyRenamePlan(plan: StructuralMutationPlan): Promise<MutationResult> {
    const [currentPath, targetPath] = inferRenamePaths(plan);
    const blockingWarning = plan.warnings.find((warning) => warning.code === "target-exists");
    if (blockingWarning !== undefined) {
      throw new Error(blockingWarning.message);
    }
    const completedPaths: string[] = [];
    const pendingPaths = new Set(plan.affectedPaths);

    try {
      await this.options.fileWriter.renameFile(
        this.storagePath(currentPath),
        this.storagePath(targetPath)
      );
      completedPaths.push(currentPath, targetPath);
      pendingPaths.delete(currentPath);
      pendingPaths.delete(targetPath);

      const rewritesByPath = groupLinkRewritesByPath(plan.linkRewrite?.rewrites ?? []);
      for (const [rewritePath, rewrites] of rewritesByPath.entries()) {
        const readPath = rewritePath === currentPath ? targetPath : rewritePath;
        const raw = await this.options.fileReader.readFile(this.storagePath(readPath));
        await this.options.fileWriter.writeFileAtomic(
          this.storagePath(readPath),
          applyLinkRewrites(raw, rewrites)
        );
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

    await this.options.index.removeDocument(currentPath);
    await this.refreshDocument(targetPath);
    for (const rewritePath of groupLinkRewritesByPath(plan.linkRewrite?.rewrites ?? []).keys()) {
      await this.refreshDocument(rewritePath === currentPath ? targetPath : rewritePath);
    }

    return {
      kind: "structural",
      changedPaths: [...new Set(completedPaths)].sort(),
      affectedPaths: [...new Set(completedPaths)].sort(),
      pathMap: { [currentPath]: targetPath },
      chapterIdMap: {},
      warnings: plan.warnings,
      linkRewrite: plan.linkRewrite,
      indexUpdated: true,
    };
  }

  resolveScene(scene: SceneRef | string): SceneRef {
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

  resolveChapter(chapter: ChapterRef | string): ChapterRef {
    if (typeof chapter !== "string") {
      return chapter;
    }
    const normalized = normalizeProjectRelativePath(chapter);
    const match = this.listChapters().find(
      (candidate) => candidate.id === normalized || candidate.path === normalized
    );
    if (match === undefined) {
      throw new Error(`Chapter not found: ${chapter}`);
    }
    return match;
  }

  private resolveNote(note: NoteRef | string): NoteRef {
    if (typeof note !== "string") {
      return note;
    }
    const normalized = normalizeProjectRelativePath(note);
    const normalizedWithMarkdown = normalized.toLowerCase().endsWith(".md")
      ? normalized
      : `${normalized}.md`;
    const basename = basenameWithoutExtension(normalized).toLowerCase();
    const match = this.listNotes().find((candidate) => {
      const candidateBasename = basenameWithoutExtension(candidate.path).toLowerCase();
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

  private async buildStructuralPlan(
    operation: StructuralMutationPlan["operation"],
    currentPath: string,
    targetPath: string,
    options: { rewriteLinks: boolean }
  ): Promise<StructuralMutationPlan> {
    const affectedPaths = new Set<string>([currentPath, targetPath]);
    const warnings: MutationWarning[] = [];
    const targetStat = await this.options.fileReader.stat(this.storagePath(targetPath));
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
      for (const link of this.options.index.getOutgoingLinks({ path: document.path })) {
        const resolution = this.options.index.resolveWikilink(link.target, { path: link.fromPath });
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

  private async rebuildManuscript(
    keepChapter: (chapter: ChapterRef) => boolean,
    keepScene: (scene: SceneRef) => boolean = () => true,
    transform: ManuscriptRebuildTransform = {},
    insertion?: ManuscriptInsertion
  ): Promise<ManuscriptMoveResult> {
    const scenesByChapter = new Map<string, SceneRef[]>();
    for (const scene of this.listScenes().filter(keepScene)) {
      const scenes = scenesByChapter.get(scene.chapterId) ?? [];
      scenes.push(scene);
      scenesByChapter.set(scene.chapterId, scenes);
    }

    const rebuilt: RebuiltChapter[] = [];
    const pathMap: Record<string, string> = {};
    const chapterIdMap: Record<string, string> = {};
    let chapterSequence = 1;
    let sceneSequence = 1;
    for (const chapter of this.listChapters()) {
      if (!keepChapter(chapter)) {
        chapterIdMap[chapter.id] = "";
        continue;
      }
      if (insertion?.targetChapterId === chapter.id && insertion.placement === "before") {
        rebuilt.push(buildInsertedChapter(insertion, chapterSequence, sceneSequence));
        chapterSequence += 1;
        sceneSequence += 1;
      }
      const scenes = scenesByChapter.get(chapter.id) ?? [];
      if (scenes.length === 0) {
        chapterIdMap[chapter.id] = "";
        continue;
      }
      const chapterTransform = transform.chapter?.(chapter, chapterSequence) ?? {};
      const nextChapterSlug =
        chapterTransform.slug ?? resequenceDefaultSlug(chapter.slug, "chapter", chapterSequence);
      const nextChapterId = `${sequencePrefix(chapterSequence)}-${nextChapterSlug}`;
      chapterIdMap[chapter.id] = nextChapterId;
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
        const nextScenePath = `manuscript/${nextChapterId}/${sequencePrefix(sceneSequence)}-${nextSceneSlug}.md`;
        pathMap[scene.path] = nextScenePath;
        rebuiltScenes.push({
          path: nextScenePath,
          oldPath: scene.path,
          raw:
            sceneTransform.raw ??
            (await this.options.fileReader.readFile(this.storagePath(scene.path))),
        });
        sceneSequence += 1;
        if (insertion?.targetScenePath === scene.path && insertion.placement === "after") {
          rebuiltScenes.push(
            buildInsertedScene(insertion.sceneTitle, nextChapterId, sceneSequence)
          );
          sceneSequence += 1;
        }
      }
      rebuilt.push({
        path: `manuscript/${nextChapterId}`,
        oldPath: chapter.path,
        chapterRaw,
        scenes: rebuiltScenes,
      });
      chapterSequence += 1;
      if (insertion?.targetChapterId === chapter.id && insertion.placement === "after") {
        rebuilt.push(buildInsertedChapter(insertion, chapterSequence, sceneSequence));
        chapterSequence += 1;
        sceneSequence += 1;
      }
    }

    const result = await this.applyRebuiltManuscript(rebuilt);
    const changedPathMap = changedEntries(pathMap);
    const changedChapterIdMap = changedEntries(chapterIdMap);
    return {
      result: {
        ...result,
        affectedPaths: result.changedPaths,
        pathMap: changedPathMap,
        chapterIdMap: changedChapterIdMap,
        warnings: [],
      },
      pathMap: changedPathMap,
      chapterIdMap: changedChapterIdMap,
    };
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
    let chapterSequence = 1;
    let sceneSequence = 1;
    for (const chapter of orderedChapters) {
      const chapterScenes = scenesByChapter.get(chapter.id) ?? [];
      if (chapterScenes.length === 0) {
        chapterIdMap[chapter.id] = "";
        continue;
      }
      const nextChapterSlug = resequenceDefaultSlug(chapter.slug, "chapter", chapterSequence);
      const nextChapterId = `${sequencePrefix(chapterSequence)}-${nextChapterSlug}`;
      chapterIdMap[chapter.id] = nextChapterId;
      const rebuiltScenes: RebuiltScene[] = [];
      for (const scene of chapterScenes) {
        const nextSceneSlug = resequenceDefaultSlug(scene.slug, "scene", sceneSequence);
        const nextScenePath = `manuscript/${nextChapterId}/${sequencePrefix(sceneSequence)}-${nextSceneSlug}.md`;
        pathMap[scene.path] = nextScenePath;
        rebuiltScenes.push({
          path: nextScenePath,
          oldPath: scene.path,
          raw: await this.options.fileReader.readFile(this.storagePath(scene.path)),
        });
        sceneSequence += 1;
      }
      rebuilt.push({
        path: `manuscript/${nextChapterId}`,
        oldPath: chapter.path,
        chapterRaw: await this.readOptionalFile(`${chapter.path}/chapter.yaml`),
        scenes: rebuiltScenes,
      });
      chapterSequence += 1;
    }

    const result = await this.applyRebuiltManuscript(rebuilt);
    const changedPathMap = changedEntries(pathMap);
    const changedChapterIdMap = changedEntries(chapterIdMap);
    return {
      result: {
        ...result,
        affectedPaths: result.changedPaths,
        pathMap: changedPathMap,
        chapterIdMap: changedChapterIdMap,
        warnings: [],
      },
      pathMap: changedPathMap,
      chapterIdMap: changedChapterIdMap,
    };
  }

  private async applyRebuiltManuscript(rebuilt: RebuiltChapter[]): Promise<MutationResult> {
    const nextFiles = new Map<string, { raw: string; oldPath?: string }>();
    const nextDirectories = new Set<string>(["manuscript"]);
    for (const chapter of rebuilt) {
      nextDirectories.add(chapter.path);
      if (chapter.chapterRaw !== undefined) {
        nextFiles.set(`${chapter.path}/chapter.yaml`, {
          raw: chapter.chapterRaw,
          oldPath: chapter.oldPath === undefined ? undefined : `${chapter.oldPath}/chapter.yaml`,
        });
      }
      for (const scene of chapter.scenes) {
        nextFiles.set(scene.path, { raw: scene.raw, oldPath: scene.oldPath });
      }
    }

    const oldScenePaths = new Set(this.listScenes().map((scene) => scene.path));
    const oldChapterPaths = new Set(this.listChapters().map((chapter) => chapter.path));
    const oldFiles = new Set<string>([...oldScenePaths]);
    for (const chapter of this.listChapters()) {
      const chapterYaml = `${chapter.path}/chapter.yaml`;
      if ((await this.statExists(chapterYaml)) && !nextFiles.has(chapterYaml)) {
        oldFiles.add(chapterYaml);
      }
    }

    const changedPaths = new Set<string>();
    for (const directory of nextDirectories) {
      await this.options.fileWriter.mkdir(this.storagePath(directory), true);
    }

    for (const [nextPath, file] of nextFiles.entries()) {
      const existingRaw = await this.readOptionalFile(nextPath);
      if (existingRaw !== file.raw) {
        await this.options.fileWriter.writeFileAtomic(this.storagePath(nextPath), file.raw);
        changedPaths.add(nextPath);
      }
      if (file.oldPath !== undefined && file.oldPath !== nextPath) {
        changedPaths.add(file.oldPath);
      }
      oldFiles.delete(nextPath);
    }

    for (const oldPath of oldFiles) {
      await this.options.fileWriter.removeFile(this.storagePath(oldPath));
      changedPaths.add(oldPath);
    }

    for (const oldChapterPath of [...oldChapterPaths].sort(
      (left, right) => right.length - left.length
    )) {
      if (!nextDirectories.has(oldChapterPath)) {
        await this.options.fileWriter.removeFile(this.storagePath(oldChapterPath));
        changedPaths.add(oldChapterPath);
      }
    }

    await this.options.rebuildIndex();
    return {
      kind: "structural",
      changedPaths: [...changedPaths].sort(),
      indexUpdated: true,
    };
  }

  private async refreshDocument(path: string): Promise<void> {
    const raw = await this.options.fileReader.readFile(this.storagePath(path));
    await this.options.index.updateDocument(path, raw);
  }

  private sceneByPath(scenePath: string): SceneRef {
    const scene = this.listScenes().find((candidate) => candidate.path === scenePath);
    if (scene === undefined) {
      throw new Error(`Scene not found after manuscript mutation: ${scenePath}`);
    }
    return scene;
  }

  private noteByPath(notePath: string): NoteRef {
    const note = this.listNotes().find((candidate) => candidate.path === notePath);
    if (note === undefined) {
      throw new Error(`Note not found after mutation: ${notePath}`);
    }
    return note;
  }

  private noteFolderByPath(folderPath: string): NoteFolderRef {
    const folder = this.options.index
      .listNoteFolders()
      .find((candidate) => candidate.path === folderPath);
    if (folder === undefined) {
      throw new Error(`Note folder not found after mutation: ${folderPath}`);
    }
    return folder;
  }

  private async uniqueNotePath(folderPath: string, title: string): Promise<string> {
    const slug = title.trim().length > 0 ? slugifyPathComponent(title) : "untitled-note";
    return this.uniquePathInFolder(folderPath, `${slug}.md`);
  }

  private async uniqueNoteFolderPath(parentPath: string, title: string): Promise<string> {
    const slug = title.trim().length > 0 ? slugifyPathComponent(title) : "untitled-folder";
    let suffix = 1;
    while (true) {
      const name = suffix === 1 ? slug : `${slug}-${suffix}`;
      const candidate = `${parentPath}/${name}`;
      const stat = await this.options.fileReader.stat(this.storagePath(candidate));
      if (!stat.exists) {
        return candidate;
      }
      suffix += 1;
    }
  }

  private async uniquePathInFolder(
    folderPath: string,
    basename: string,
    currentPath?: string
  ): Promise<string> {
    const stem = basename.toLowerCase().endsWith(".md") ? basename.slice(0, -3) : basename;
    let suffix = 1;
    while (true) {
      const filename = suffix === 1 ? `${stem}.md` : `${stem}-${suffix}.md`;
      const candidate = `${folderPath}/${filename}`;
      const stat = await this.options.fileReader.stat(this.storagePath(candidate));
      if (!stat.exists || candidate === currentPath) {
        return candidate;
      }
      suffix += 1;
    }
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

  private async readOptionalFile(path: string): Promise<string | undefined> {
    const stat = await this.options.fileReader.stat(this.storagePath(path));
    return stat.exists && !stat.isDirectory
      ? this.options.fileReader.readFile(this.storagePath(path))
      : undefined;
  }

  private async statExists(path: string): Promise<boolean> {
    const stat = await this.options.fileReader.stat(this.storagePath(path));
    return stat.exists && !stat.isDirectory;
  }

  private storagePath(path: string): string {
    return this.options.toStoragePath(normalizeProjectRelativePath(path));
  }
}

interface RebuiltScene {
  path: string;
  oldPath?: string;
  raw: string;
}

interface RebuiltChapter {
  path: string;
  oldPath?: string;
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

function setMarkdownTitle(raw: string, title: string): string {
  const parsed = parseNoteFrontmatter(raw);
  const frontmatter = withOptionalTitle(parsed.frontmatter, title);
  return Object.keys(frontmatter).length === 0
    ? parsed.body
    : serializeNoteFrontmatter(frontmatter, parsed.body);
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
  return candidatePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function normalizeNoteTargetPath(candidatePath: string): string {
  const normalized = normalizeProjectRelativePath(candidatePath);
  const withDirectory = normalized.startsWith("notes/") ? normalized : `notes/${normalized}`;
  return withDirectory.toLowerCase().endsWith(".md") ? withDirectory : `${withDirectory}.md`;
}

function normalizeNoteFolderPath(folderPath: string | string[] | undefined): string {
  const parts = Array.isArray(folderPath) ? folderPath : (folderPath ?? "").split("/");
  const normalized = parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "." && part !== "notes");
  return normalized.length === 0 ? "notes" : `notes/${normalized.join("/")}`;
}

function resolveNoteFolderPath(folder: NoteFolderRef | string): string {
  if (typeof folder !== "string") {
    return normalizeNoteFolderPath(folder.folderPath);
  }
  return normalizeNoteFolderPath(folder);
}

function serializeNoteMarkdown(title: string): string {
  const normalizedTitle = title.trim().length > 0 ? title.trim() : "Untitled Note";
  return `---\ntitle: ${JSON.stringify(normalizedTitle)}\n---\n\n# ${normalizedTitle}\n`;
}

function nextDocumentAfterNoteRemoval(
  notes: NoteRef[],
  scenes: SceneRef[],
  removedNoteIndex: number
): SceneRef | NoteRef | undefined {
  if (notes.length > 0) {
    return notes[Math.min(Math.max(removedNoteIndex, 0), notes.length - 1)];
  }
  return scenes[0];
}

function renameScenePath(currentPath: string, nextSlug: string): string {
  const normalizedSlug = slugifyPathComponent(nextSlug);
  const normalized = normalizeProjectRelativePath(currentPath);
  const directory = normalized.includes("/")
    ? normalized.slice(0, normalized.lastIndexOf("/"))
    : ".";
  const basename = normalized.split("/").at(-1) ?? normalized;
  const sceneSequencePrefix = basename.match(/^(\d+)-/)?.[1];
  if (sceneSequencePrefix === undefined) {
    throw new Error(`Scene path does not have a sequence-prefixed filename: ${currentPath}`);
  }
  return `${directory}/${sceneSequencePrefix}-${normalizedSlug}.md`;
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

function changedEntries(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).filter(([from, to]) => from !== to));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
