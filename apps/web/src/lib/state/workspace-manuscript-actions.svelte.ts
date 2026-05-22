import type { ManuscriptInsertionPlacement } from "@claros/story-state/browser";

import type { SceneMoveOptions } from "$lib/manuscript-drag";
import type { WorkspaceChapter, WorkspaceMoveResult, WorkspaceScene } from "$lib/project-session";
import type { WorkspaceContext } from "./workspace-context.svelte";
import type { WorkspaceDocuments } from "./workspace-documents.svelte";

export class WorkspaceManuscriptActions {
  constructor(
    private readonly ctx: WorkspaceContext,
    private readonly documents: WorkspaceDocuments
  ) {}

  canDeleteChapter(chapter: WorkspaceChapter): boolean {
    return (
      this.ctx.chapters.length > 1 &&
      this.ctx.scenes.some((scene) => scene.chapterId !== chapter.id)
    );
  }

  canDeleteScene(): boolean {
    return this.ctx.scenes.length > 1;
  }

  canMoveChapter(chapter: WorkspaceChapter, direction: "up" | "down"): boolean {
    const index = this.ctx.chapters.findIndex((candidate) => candidate.id === chapter.id);
    return direction === "up" ? index > 0 : index >= 0 && index < this.ctx.chapters.length - 1;
  }

  canMoveScene(scene: WorkspaceScene, direction: "up" | "down"): boolean {
    const index = this.ctx.scenes.findIndex((candidate) => candidate.path === scene.path);
    return direction === "up" ? index > 0 : index >= 0 && index < this.ctx.scenes.length - 1;
  }

  async moveCurrentChapter(direction: "up" | "down"): Promise<void> {
    if (this.ctx.activeChapter !== undefined) {
      await this.moveChapterByDirection(this.ctx.activeChapter, direction);
    }
  }

  async moveCurrentScene(direction: "up" | "down"): Promise<void> {
    if (this.ctx.activeScene !== undefined) {
      await this.moveSceneByDirection(this.ctx.activeScene, direction);
    }
  }

  async moveChapterByDirection(chapter: WorkspaceChapter, direction: "up" | "down"): Promise<void> {
    const index = this.ctx.chapters.findIndex((candidate) => candidate.id === chapter.id);
    const target = this.ctx.chapters[direction === "up" ? index - 1 : index + 1];
    if (this.ctx.project === undefined || target === undefined) return;
    await this.moveChapter(chapter.id, {
      placement: direction === "up" ? "before" : "after",
      targetChapterId: target.id,
    });
  }

  async moveSceneByDirection(scene: WorkspaceScene, direction: "up" | "down"): Promise<void> {
    const index = this.ctx.scenes.findIndex((candidate) => candidate.path === scene.path);
    const target = this.ctx.scenes[direction === "up" ? index - 1 : index + 1];
    if (this.ctx.project === undefined || target === undefined) return;
    await this.moveScene(scene.path, {
      placement: direction === "up" ? "before" : "after",
      targetScenePath: target.path,
    });
  }

  async moveChapter(
    chapterId: string,
    options: { placement: "before" | "after"; targetChapterId: string }
  ): Promise<void> {
    if (this.ctx.project === undefined) return;
    this.ctx.contextMenu = undefined;
    await this.documents.flushSave();
    const move = await this.ctx.project.moveChapter(chapterId, options);
    await this.refreshAfterMove(move);
  }

  async moveScene(
    scenePath: string,
    options: SceneMoveOptions,
    moveOptions: { skipEmptyChapterConfirmation?: boolean } = {}
  ): Promise<void> {
    if (this.ctx.project === undefined) return;
    this.ctx.contextMenu = undefined;
    if (
      !moveOptions.skipEmptyChapterConfirmation &&
      this.shouldConfirmEmptyChapterDeletion(scenePath, options)
    ) {
      this.openEmptyChapterMoveConfirmation(scenePath, options);
      return;
    }
    await this.documents.flushSave();
    const move = await this.ctx.project.moveScene(scenePath, options);
    await this.refreshAfterMove(move);
  }

  shouldConfirmEmptyChapterDeletion(scenePath: string, options: SceneMoveOptions): boolean {
    const scene = this.ctx.scenes.find((candidate) => candidate.path === scenePath);
    const targetChapterId = this.targetChapterIdForSceneMove(options);
    return (
      scene !== undefined &&
      targetChapterId !== undefined &&
      targetChapterId !== scene.chapterId &&
      this.ctx.scenes.filter((candidate) => candidate.chapterId === scene.chapterId).length === 1
    );
  }

  targetChapterIdForSceneMove(options: SceneMoveOptions): string | undefined {
    if (options.placement === "append") return options.targetChapterId;
    return this.ctx.scenes.find((scene) => scene.path === options.targetScenePath)?.chapterId;
  }

  openEmptyChapterMoveConfirmation(scenePath: string, options: SceneMoveOptions): void {
    const scene = this.ctx.scenes.find((candidate) => candidate.path === scenePath);
    const chapter =
      scene === undefined
        ? undefined
        : this.ctx.chapters.find((candidate) => candidate.id === scene.chapterId);
    const sceneLabel = scene?.title ?? "this scene";
    const chapterLabel = chapter?.title ?? "its current chapter";
    this.ctx.confirmationModal = {
      heading: "Delete Empty Chapter?",
      message: `Moving "${sceneLabel}" out of "${chapterLabel}" will delete the empty chapter.`,
      confirmLabel: "Move and Delete Chapter",
      cancelLabel: "Cancel",
      onConfirm: () =>
        void this.moveScene(scenePath, options, { skipEmptyChapterConfirmation: true }),
    };
  }

  async refreshAfterMove(move: WorkspaceMoveResult): Promise<void> {
    const nextActivePath = move.pathMap[this.ctx.activePath] ?? this.ctx.activePath;
    this.documents.refreshProjectView();
    if (
      nextActivePath !== this.ctx.activePath ||
      this.ctx.scenes.some((scene) => scene.path === nextActivePath)
    ) {
      await this.documents.openDocument(nextActivePath, { forceReload: true, skipSave: true });
    }
  }

  chapterCreationSequence(
    placement: ManuscriptInsertionPlacement,
    targetChapterId?: string
  ): number {
    if (placement === "append" || targetChapterId === undefined)
      return this.ctx.chapters.length + 1;
    const targetIndex = this.ctx.chapters.findIndex((chapter) => chapter.id === targetChapterId);
    if (targetIndex === -1) return this.ctx.chapters.length + 1;
    return placement === "before" ? targetIndex + 1 : targetIndex + 2;
  }

  sceneCreationSequence(placement: ManuscriptInsertionPlacement, targetScenePath?: string): number {
    if (placement === "append" || targetScenePath === undefined) return this.ctx.scenes.length + 1;
    const targetIndex = this.ctx.scenes.findIndex((scene) => scene.path === targetScenePath);
    if (targetIndex === -1) return this.ctx.scenes.length + 1;
    return placement === "before" ? targetIndex + 1 : targetIndex + 2;
  }

  firstSceneSequenceForChapterCreation(
    placement: ManuscriptInsertionPlacement | undefined,
    targetChapterId?: string
  ): number {
    if (placement === undefined || placement === "append" || targetChapterId === undefined) {
      return this.ctx.scenes.length + 1;
    }
    const targetIndex = this.ctx.chapters.findIndex((chapter) => chapter.id === targetChapterId);
    if (targetIndex === -1) return this.ctx.scenes.length + 1;
    return (
      this.ctx.scenes.filter((scene) => {
        const chapterIndex = this.ctx.chapters.findIndex(
          (chapter) => chapter.id === scene.chapterId
        );
        return placement === "before" ? chapterIndex < targetIndex : chapterIndex <= targetIndex;
      }).length + 1
    );
  }
}
